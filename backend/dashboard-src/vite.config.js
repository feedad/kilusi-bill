import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    base: '/dashboard/',
    build: {
        outDir: '../public/dashboard',
        emptyOutDir: true,
        sourcemap: false
    },
    server: {
        port: 3002,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
});
