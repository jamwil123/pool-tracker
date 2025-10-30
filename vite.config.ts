import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev-only proxy to bypass CORS locally
      '/api/standings': {
        target: 'https://europe-west2-pool-league-74bf5.cloudfunctions.net',
        changeOrigin: true,
        // Ensure this targets the deployed function name
        rewrite: () => '/standingsProxy',
      },
    },
  },
})
