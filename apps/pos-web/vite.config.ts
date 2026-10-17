import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Reachable from other devices on the shop's Wi-Fi, not only this PC.
    host: true,
    port: 5173,
    // Same origin as the page, so the session and device cookies just work.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
