import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Static hosting on GitHub Pages: the site lives at /meal-rating/, not a domain root.
// There is no service worker; `version.json` + the in-app check (src/lib/version.js)
// is how a new deploy reaches an already-open / home-screen-installed client.
const BUILD_ID = String(Date.now())

export default defineConfig({
  base: '/meal-rating/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ v: BUILD_ID }),
        })
      },
    },
  ],
})
