import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildTime = new Date().toISOString()
const buildVersion = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(buildTime)).replaceAll('-', '').replace(' ', '_').replace(':', '')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'build-info',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ version: buildVersion, builtAt: buildTime }) })
    },
  }],
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
  },
  // Use relative assets so the bundle loads inside Tauri's local protocol.
  base: './',
  server: {
    host: true, // Listen on all addresses, including IPv4
    port: 5173,
    strictPort: true,
  },
})
