import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { Button, Field, Input } from '../components/ui.jsx'

const HANDLE_RE = /^[a-z0-9_]{2,20}$/

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 18)
}

async function suggestHandle(name) {
  const base = slugify(name) || 'user'
  for (const suffix of ['', '2', '3', '4', '5', '6', '7', '8', '9']) {
    const cand = (base + suffix).slice(0, 20)
    if (cand.length < 2) continue
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('handle', cand)
      .maybeSingle()
    if (!data) return cand
  }
  return (base + Math.floor(Math.random() * 900 + 100)).slice(0, 20)
}

export default function Onboarding() {
  const { user, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleDirty, setHandleDirty] = useState(false)
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const debounce = useRef(null)

  const handleValid = HANDLE_RE.test(handle)

  // Auto-fill the handle from the name until the user edits it themselves.
  useEffect(() => {
    if (handleDirty) return
    const name = displayName.trim()
    if (!name) {
      setHandle('')
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const s = await suggestHandle(name)
      if (!cancelled) setHandle(s)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [displayName, handleDirty])

  useEffect(() => {
    setAvailable(null)
    if (!handleValid) return
    setChecking(true)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', handle)
        .maybeSingle()
      setChecking(false)
      if (!error) setAvailable(!data)
    }, 350)
    return () => clearTimeout(debounce.current)
  }, [handle, handleValid])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      handle,
      display_name: displayName.trim(),
    })
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505'
          ? 'That handle was just taken — try another.'
          : error.message,
      )
      return
    }
    await refreshProfile()
  }

  let handleHint =
    'Others search this to invite you to a household. Lowercase letters, numbers, underscore.'
  let handleError = null
  if (handle && !handleValid) handleError = '2–20 chars: letters, numbers, underscore.'
  else if (available === false) handleError = 'That handle is taken.'
  else if (checking) handleHint = 'Checking availability…'
  else if (available === true) handleHint = `@${handle} is available.`

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Welcome</h1>
        <p className="mt-1 text-sm text-slate-400">
          A couple of details and you’re in.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Your name" hint="Shown to your household everywhere.">
          <Input
            autoFocus
            required
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Chip"
          />
        </Field>

        <Field label="Handle" hint={handleHint} error={handleError}>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">@</span>
            <Input
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={handle}
              onChange={(e) => {
                setHandleDirty(true)
                setHandle(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                )
              }}
              placeholder="chip"
            />
          </div>
        </Field>

        <Button
          type="submit"
          full
          size="lg"
          disabled={
            busy || !handleValid || available !== true || !displayName.trim()
          }
        >
          {busy ? 'Saving…' : 'Continue'}
        </Button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>
    </div>
  )
}
