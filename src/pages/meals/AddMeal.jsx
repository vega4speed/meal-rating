import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { MEAL_TAGS } from '../../lib/catalog.js'
import { Button, Field, Input } from '../../components/ui.jsx'
import TagChips from '../../components/TagChips.jsx'
import BackLink from '../../components/BackLink.jsx'

export default function AddMeal() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [providers, setProviders] = useState([])
  const [providerId, setProviderId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('providers')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setProviders(data ?? [])
        if (data?.length === 1) setProviderId(data[0].id)
      })
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase
      .from('meals')
      .insert({
        provider_id: providerId,
        name: name.trim(),
        description: description.trim() || null,
        tags,
        created_by: user.id,
      })
      .select('id')
      .single()
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505'
          ? 'That meal is already in the catalog for this provider.'
          : error.message,
      )
      return
    }
    nav(`/meals/${data.id}`, { replace: true })
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/meals" />
      <h1 className="text-xl font-semibold text-slate-100">Add a meal</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Provider">
          <select
            required
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-100"
          >
            <option value="" disabled>
              Select…
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Name" hint="As printed on the menu.">
          <Input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Chimichurri Steak Bowl"
          />
        </Field>

        <Field label="Description" hint="Optional.">
          <textarea
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none focus:border-emerald-500"
          />
        </Field>

        <Field label="Tags">
          <TagChips
            options={MEAL_TAGS}
            selected={tags}
            onToggle={(t) =>
              setTags((cur) =>
                cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
              )
            }
          />
        </Field>

        <Button type="submit" full size="lg" disabled={busy || !name.trim() || !providerId}>
          {busy ? 'Adding…' : 'Add meal'}
        </Button>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </form>
    </div>
  )
}
