import { useEffect } from 'react'

// Baked in at build time (vite.config.js `define`). 'dev' when running `vite`.
const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

// GitHub Pages has no service worker, so an installed / long-open client keeps
// running the JS bundle its cached index.html points at. Poll the freshly-built
// version.json and reload once when a newer deploy is live.
export function useVersionCheck() {
  useEffect(() => {
    if (BUILD_ID === 'dev') return
    let stopped = false

    async function check() {
      if (stopped || document.visibilityState !== 'visible') return
      try {
        const res = await fetch(
          `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`,
          { cache: 'no-store' },
        )
        if (!res.ok) return
        const { v } = await res.json()
        if (v && v !== BUILD_ID) window.location.reload()
      } catch {
        /* offline or blocked — try again next tick */
      }
    }

    const id = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    check()
    return () => {
      stopped = true
      clearInterval(id)
      window.removeEventListener('focus', check)
    }
  }, [])
}
