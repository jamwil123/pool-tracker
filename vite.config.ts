import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev-only proxy to bypass CORS locally
      '/api/standings': {
        target: 'https://scrapecleaguetable-wbv6pvivda-nw.a.run.app/',
        changeOrigin: true,
        rewrite: (path) => '/',
      },
    },
  },
})
