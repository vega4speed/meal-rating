import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { Button, Field, Input } from '../../components/ui.jsx'
import BackLink from '../../components/BackLink.jsx'

export default function CreateHousehold() {
  const nav = useNavigate()
  const { refresh, setActive } = useHousehold()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_household', {
      p_name: name.trim(),
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await refresh()
    if (data?.id) setActive(data.id)
    nav('/household')
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/household" />
      <h1 className="text-xl font-semibold text-slate-100">Create a household</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Household name" hint="e.g. Home">
          <Input
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home"
          />
        </Field>
        <Button type="submit" full size="lg" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>
    </div>
  )
}
