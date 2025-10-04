import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('@chakra-ui')) return 'vendor-chakra'
            if (id.includes('firebase')) return 'vendor-firebase'
            if (id.includes('recharts')) return 'vendor-recharts'
            return 'vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
