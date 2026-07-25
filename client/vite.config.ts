import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000';

// Proxying keeps the browser on one origin, so cookies/CORS never enter the
// picture and server-sent events stream without buffering.
const proxy = {
  '/api': { target: API_TARGET, changeOrigin: true },
  '/health': { target: API_TARGET, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  // `vite preview` serves the built bundle, so it needs the same proxy to be a
  // usable smoke test of the production artifact.
  preview: { port: 4173, proxy },
});
