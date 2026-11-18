import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' = caminhos relativos (funciona no GitHub Pages em subdiretório)
export default defineConfig({ plugins: [react()], base: './' })
