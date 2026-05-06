// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // ✅ ESTO ES LO MÁS IMPORTANTE:
  // Debe ser EXACTAMENTE: /nombre-del-repo/
  // Si tu repo es https://github.com/Sergitobaza2/24hbaza
  // Entonces base debe ser: '/24hbaza/'
  base: '/24hbaza/',
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // ✅ Asegura que las rutas sean relativas dentro del build
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});