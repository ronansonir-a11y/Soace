import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
