import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base './': relative asset paths, so the build works from any folder of any static host (no server needed);
// ES-module workers (the filter design worker starts sub-workers of its own)
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
})
