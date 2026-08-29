import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { Button, Field, Input } from '../../components/ui.jsx'
import BackLink from '../../components/BackLink.jsx'

export default function JoinByCode() {
  const nav = useNavigate()
  const { refresh, setActive } = useHousehold()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('join_household_by_code', {
      p_code: code.trim(),
    })
    setBusy(false)
    if (error) {
      setError(error.message.includes('invalid code') ? 'That code didn’t match any household.' : error.message)
      return
    }
    await refresh()
    if (data?.id) setActive(data.id)
    nav('/household')
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/household" />
      <h1 className="text-xl font-semibold text-slate-100">Join by code</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Join code" hint="Ask a household member for their 6-character code.">
          <Input
            required
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }
            placeholder="ABC123"
          />
        </Field>
        <Button type="submit" full size="lg" disabled={busy || code.length < 6}>
          {busy ? 'Joining…' : 'Join'}
        </Button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>
    </div>
  )
}
