import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

import router from './router'
import store from './store'
import './style.css'

const app = createApp(App)
app.use(store)
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })
