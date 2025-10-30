import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'react-vendor'
            if (id.includes('recharts')) return 'recharts'
            if (id.includes('firebase')) return 'firebase'
            if (id.includes('@chakra-ui') || id.includes('@emotion') || id.includes('framer-motion')) return 'chakra'
          }
        },
      },
    },
  },
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
