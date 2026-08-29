import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { Button, Field, Input } from '../components/ui.jsx'

const HANDLE_RE = /^[a-z0-9_]{2,20}$/

export default function Onboarding() {
  const { user, refreshProfile } = useAuth()
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState(null) // null | true | false
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const debounce = useRef(null)

  const handleValid = HANDLE_RE.test(handle)

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
          ? 'That handle was just taken. Try another.'
          : error.message,
      )
      return
    }
    await refreshProfile()
  }

  let handleHint = 'Lowercase letters, numbers, underscore. 2–20 characters.'
  let handleError = null
  if (handle && !handleValid) handleError = handleHint
  else if (available === false) handleError = 'Taken.'
  else if (checking) handleHint = 'Checking…'
  else if (available === true) handleHint = 'Available.'

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Set up your profile</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your handle is how household members find you.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Handle" hint={handleHint} error={handleError}>
          <Input
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={handle}
            onChange={(e) =>
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            }
            placeholder="chip"
          />
        </Field>

        <Field label="Display name">
          <Input
            required
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Chip"
          />
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
        {error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : null}
      </form>
    </div>
  )
}
