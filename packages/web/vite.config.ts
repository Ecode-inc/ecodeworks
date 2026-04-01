import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'

function versionPlugin() {
  return {
    name: 'version-plugin',
    buildStart() {
      const hash = Date.now().toString(36)
      writeFileSync('public/version.json', JSON.stringify({ hash, built: new Date().toISOString() }))
    },
  }
}

export default defineConfig({
  plugins: [react(), versionPlugin()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
    },
  },
})
