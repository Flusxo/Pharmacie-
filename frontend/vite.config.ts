/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// One root .env (envDir '..'); only VITE_* variables reach the browser.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  // The browser always calls the relative /api path; Vite forwards it to the API.
  const apiTarget = process.env.API_PROXY_TARGET || `http://localhost:${env.PORT || 4000}`;
  const proxy = { '/api': { target: apiTarget, changeOrigin: false } };
  return {
    envDir: '..',
    plugins: [react()],
    server: { port: Number(process.env.FRONTEND_PORT || 5173), strictPort: true, proxy },
    preview: { port: Number(process.env.FRONTEND_PORT || 4173), strictPort: true, proxy },
    build: { chunkSizeWarningLimit: 900 },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
