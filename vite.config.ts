import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            sourcemap: command === 'serve',
            rollupOptions: {
              external: ['electron', ...Object.keys(pkg.dependencies)],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            sourcemap: command === 'serve' ? 'inline' : undefined,
          },
        },
      },
    }),
  ],
  clearScreen: false,
}))
