import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative assets so the bundle loads inside Tauri's local protocol.
  base: './',
  server: {
    host: true, // Listen on all addresses, including IPv4
    port: 5173,
    strictPort: true,
  },
})
