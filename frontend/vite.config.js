import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En dev, /api/* est relayé vers le backend FastAPI (port 8001), flux NDJSON compris.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8001', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
    },
  },
})
