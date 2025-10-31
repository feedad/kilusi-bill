import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Proxy all backend admin APIs to Express during development
      // The React app serves under /ui so there is no conflict with legacy /admin pages
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
