import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Static hosting on GitHub Pages: the site lives at /meal-rating/, not a domain root.
// There is no service worker; `version.json` + the in-app check (src/lib/version.js)
// is how a new deploy reaches an already-open / home-screen-installed client.
const BUILD_ID = String(Date.now())
const BUILD_TIME = new Date().toISOString()
let BUILD_SHA = 'local'
try {
  BUILD_SHA = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  /* no git — keep 'local' */
}

export default defineConfig({
  base: '/meal-rating/',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ v: BUILD_ID, sha: BUILD_SHA }),
        })
      },
    },
  ],
})
