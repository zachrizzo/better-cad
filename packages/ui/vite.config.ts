import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import path from 'path'

export default defineConfig({
  plugins: [react(), wasm()],
  build: {
    target: 'esnext',
    rollupOptions: {
      external: ['@tauri-apps/api/core', '@tauri-apps/plugin-dialog'],
    },
  },
  resolve: {
    alias: {
      '@bettercad/wasm': path.resolve(__dirname, '../wasm-pkg/bcad_wasm.js'),
    },
  },
  optimizeDeps: {
    exclude: ['@bettercad/wasm'],
  },
})
