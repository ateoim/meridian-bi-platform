import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['sql.js'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
