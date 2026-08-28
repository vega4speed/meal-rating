import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { Button, Field, Input } from '../../components/ui.jsx'
import BackLink from '../../components/BackLink.jsx'

export default function MealDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [meal, setMeal] = useState(null)
  const [variations, setVariations] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [m, v] = await Promise.all([
      supabase
        .from('meals')
        .select(
          'id, name, description, tags, created_by, created_at, providers(name)',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('meal_variations')
        .select('id, label, notes, created_at')
        .eq('meal_id', id)
        .order('created_at', { ascending: true }),
    ])
    setMeal(m.data ?? null)
    setVariations(v.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function addVariation(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('meal_variations').insert({
      meal_id: id,
      label: label.trim(),
      notes: notes.trim() || null,
    })
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505' ? 'That label already exists.' : error.message,
      )
      return
    }
    setLabel('')
    setNotes('')
    setAdding(false)
    await load()
  }

  if (loading) return <p className="py-8 text-sm text-slate-500">Loading…</p>
  if (!meal) return <p className="py-8 text-sm text-slate-500">Meal not found.</p>

  return (
    <div className="flex flex-col gap-5 py-2">
      <BackLink to="/meals" />
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{meal.name}</h1>
        <p className="mt-1 text-xs text-slate-500">{meal.providers?.name}</p>
      </div>

      {meal.description ? (
        <p className="text-sm text-slate-300">{meal.description}</p>
      ) : null}

      {meal.tags?.length ? (
        <div className="flex flex-wrap gap-2">
          {meal.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">Variations</h2>
        <ul className="flex flex-col divide-y divide-slate-800">
          {variations.map((v) => (
            <li key={v.id} className="py-3">
              <div className="text-slate-100">{v.label}</div>
              {v.notes ? (
                <div className="text-xs text-slate-500">{v.notes}</div>
              ) : null}
            </li>
          ))}
        </ul>

        {adding ? (
          <form
            onSubmit={addVariation}
            className="mt-2 flex flex-col gap-3 rounded-xl border border-slate-800 p-3"
          >
            <Field label="Label" hint="e.g. Spicy, with sweet potato">
              <Input
                required
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <Field label="Notes" hint="Optional.">
              <Input
                maxLength={200}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !label.trim()}>
                {busy ? 'Adding…' : 'Add variation'}
              </Button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-3 text-sm font-medium text-slate-400"
              >
                Cancel
              </button>
            </div>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="self-start text-sm font-medium text-emerald-400"
          >
            + Add a variation
          </button>
        )}
      </section>

      <p className="text-xs text-slate-600">
        Ratings arrive in the next phase.
      </p>
    </div>
  )
}
