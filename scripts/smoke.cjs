const assert = require('node:assert/strict')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { version } = require('../package.json')

const executable = path.resolve(process.argv[2] || `release/${version}/win-unpacked/TaskFlow.exe`)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-smoke-'))
let child
let socket

async function main() {
  assert.ok(fs.existsSync(executable), 'Build the Windows package first')
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  child = spawn(executable, [`--user-data-dir=${dataDir}`, `--remote-debugging-port=${port}`], {
    env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  child.on('error', error => { output += error.message })
  let page
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      page = pages.find(item => item.type === 'page' && item.url.startsWith('file:'))
      if (page) break
    } catch {}
    if (child.exitCode !== null) throw new Error(`App exited: ${output}`)
    await delay(250)
  }
  assert.ok(page, `Packaged app did not start: ${output}`)
  assert.ok(output.toLowerCase().includes(path.join(dataDir, 'task-manager.db').toLowerCase()),
    'App must use the isolated test data directory before creating test data')

  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 0
  const pending = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  }
  function call(method, params = {}) {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 15000)
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value) },
        reject: error => { clearTimeout(timeout); reject(error) },
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("document.body.innerText.includes('登录') && !!window.ipcRenderer")) break
    await delay(250)
  }
  const result = await evaluate(`(async () => {
    const invoke = (...args) => window.ipcRenderer.invoke(...args);
    const registered = await invoke('auth:register', { username: 'smoke-user', password: 'smoke-test-password', nickname: 'Smoke Test' });
    if (!registered.success) throw new Error(registered.message);
    const rejected = await invoke('auth:login', { username: 'smoke-user', password: 'wrong-password' });
    const loggedIn = await invoke('auth:login', { username: 'smoke-user', password: 'smoke-test-password' });
    const task = await invoke('db:task:create', { user_id: registered.user.id, name: 'Packaged SQLite smoke test' });
    const saved = await invoke('db:task:getById', task.id);
    const inputs = document.querySelectorAll('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [index, value] of ['smoke-user', 'smoke-test-password'].entries()) {
      setter.call(inputs[index], value); inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
    }
    await Promise.resolve();
    document.querySelector('button[type="submit"]').click();
    return { registered: registered.success, wrongPasswordRejected: !rejected.success,
      loggedIn: loggedIn.success, hashExcluded: !('password_hash' in loggedIn.user), saved: saved.name === task.name };
  })()`)
  assert.ok(Object.values(result).every(Boolean), JSON.stringify(result))
  let taskVisible = false
  for (let attempt = 0; attempt < 60; attempt++) {
    taskVisible = await evaluate("document.body.innerText.includes('Packaged SQLite smoke test')")
    if (taskVisible) break
    await delay(250)
  }
  assert.ok(taskVisible, 'Task must appear after signing in through the login form')
  const screenshot = await call('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(path.dirname(path.dirname(executable)), 'smoke.png'), Buffer.from(screenshot.data, 'base64'))
  const closing = new Promise(resolve => child.once('exit', resolve))
  void evaluate('window.close()').catch(() => {})
  await Promise.race([closing, delay(5000)])
  assert.ok(fs.existsSync(path.join(dataDir, 'task-manager.db')), 'Database must exist on disk')
  console.log(JSON.stringify({ ...result, taskVisible, executable, dataDir }))
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  socket?.close()
  if (child && child.exitCode === null) child.kill()
})
