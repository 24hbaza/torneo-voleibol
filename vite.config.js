import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: "/torneo-voleibol/",  // 👈 AÑADE ESTA LÍNEA (nombre exacto de tu repo)
})