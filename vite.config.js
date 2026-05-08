import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/torneo-voleibol/',  // 👈 OBLIGATORIO: debe coincidir con el nombre del repo
})