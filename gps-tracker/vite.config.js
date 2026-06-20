import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        login: resolve(__dirname, 'login.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        history: resolve(__dirname, 'history.html'),
        overview: resolve(__dirname, 'overview.html'),
      },
    },
  },
});
