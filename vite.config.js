import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Static hosting on GitHub Pages: the site lives at /meal-rating/, not a domain root.
export default defineConfig({
  base: '/meal-rating/',
  plugins: [react(), tailwindcss()],
})
