import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
  },
  plugins: [react()],
  // Tauri expects a fixed port and strict mode
  server: {
    port: 1420,
    strictPort: true,
    // Don't watch Rust files — triggers unnecessary rebuilds
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  // Produce relative paths for Tauri's custom protocol
  base: './',
})
