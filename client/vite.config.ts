import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(rootDir, './src'),
      react: path.resolve(rootDir, './node_modules/react'),
      'react-dom': path.resolve(rootDir, './node_modules/react-dom'),
    },
  },
  // Bind IPv4 explicitly — macOS Vite often defaults to ::1 only, which breaks
  // http://127.0.0.1 links used in .env / bookmarks.
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
