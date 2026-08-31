import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'
import { relativeWeek } from '../../lib/badges.js'
import {
  Button,
  Field,
  Input,
  Pill,
  Spinner,
  SectionHeading,
} from '../../components/ui.jsx'
import BackLink from '../../components/BackLink.jsx'
import VariationRating from './VariationRating.jsx'

export default function MealDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { activeId } = useHousehold()

  const [meal, setMeal] = useState(null)
  const [variations, setVariations] = useState([])
  const [myRatings, setMyRatings] = useState({}) // variation_id -> row
  const [hhStats, setHhStats] = useState({}) // variation_id -> row
  const [breakdown, setBreakdown] = useState({}) // variation_id -> [rows]
  const [history, setHistory] = useState(null) // { offered, had }
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
          'id, name, description, tags, image_url, price_cents, menu_appearances, menu_last_seen, created_by, created_at, providers(name)',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('meal_variations')
        .select(
          'id, label, notes, created_at, calories, fat_g, protein_g, carbs_g',
        )
        .eq('meal_id', id)
        .order('created_at', { ascending: true }),
    ])
    setMeal(m.data ?? null)
    const vars = v.data ?? []
    setVariations(vars)

    const varIds = vars.map((x) => x.id)
    if (varIds.length) {
      const [mine, stats, bd] = await Promise.all([
        supabase
          .from('ratings')
          .select('variation_id, score, would_reorder, notes')
          .eq('user_id', user.id)
          .in('variation_id', varIds),
        activeId
          ? supabase
              .from('v_variation_household_stats')
              .select('variation_id, avg_score, rating_count, reorder_rate')
              .eq('household_id', activeId)
              .in('variation_id', varIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from('ratings')
          .select(
            'variation_id, user_id, score, would_reorder, notes, profiles(display_name)',
          )
          .in('variation_id', varIds),
      ])
      setMyRatings(
        Object.fromEntries((mine.data ?? []).map((r) => [r.variation_id, r])),
      )
      setHhStats(
        Object.fromEntries((stats.data ?? []).map((r) => [r.variation_id, r])),
      )
      const grouped = {}
      for (const r of bd.data ?? []) {
        ;(grouped[r.variation_id] ||= []).push(r)
      }
      setBreakdown(grouped)
    }

    if (activeId) {
      const [off, had] = await Promise.all([
        supabase
          .from('v_meal_household_last_offered')
          .select('last_week')
          .eq('household_id', activeId)
          .eq('meal_id', id)
          .maybeSingle(),
        supabase
          .from('v_meal_household_last_had')
          .select('last_week')
          .eq('household_id', activeId)
          .eq('meal_id', id)
          .maybeSingle(),
      ])
      setHistory({
        offered: off.data?.last_week ?? null,
        had: had.data?.last_week ?? null,
      })
    }
    setLoading(false)
  }, [id, user.id, activeId])

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

  if (loading) return <Spinner />
  if (!meal) return <p className="py-8 text-sm text-slate-500">Meal not found.</p>

  return (
    <div className="flex flex-col gap-5">
      <BackLink to={-1} fallback="/meals">Back</BackLink>

      {meal.image_url ? (
        <img
          src={meal.image_url}
          alt={meal.name}
          loading="lazy"
          onError={(e) => (e.currentTarget.style.display = 'none')}
          className="aspect-[4/3] w-full rounded-2xl object-cover"
        />
      ) : null}

      <div>
        <h1 className="text-xl font-semibold text-slate-100">{meal.name}</h1>
        <p className="mt-1 text-xs text-slate-500">
          {meal.providers?.name}
          {meal.price_cents != null
            ? ` · $${(meal.price_cents / 100).toFixed(2)}`
            : ''}
          {meal.menu_appearances >= 2 ? ` · ${meal.menu_appearances} menus` : ''}
        </p>
      </div>

      {meal.description ? (
        <p className="text-sm text-slate-300">{meal.description}</p>
      ) : null}

      {meal.tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {meal.tags.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
      ) : null}

      {history && (history.offered || history.had) ? (
        <div className="flex gap-4 text-xs text-slate-500">
          <span>On a menu: {relativeWeek(history.offered)}</span>
          <span>Last had: {relativeWeek(history.had)}</span>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeading>Variations &amp; ratings</SectionHeading>
        {variations.map((v) => (
          <VariationRating
            key={v.id}
            variation={v}
            userId={user.id}
            householdStat={hhStats[v.id] ?? null}
            myRating={myRatings[v.id] ?? null}
            breakdown={breakdown[v.id] ?? []}
            onChanged={load}
          />
        ))}

        {adding ? (
          <form
            onSubmit={addVariation}
            className="flex flex-col gap-3 rounded-2xl border border-slate-800 p-4"
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
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || !label.trim()}>
                {busy ? 'Adding…' : 'Add variation'}
              </Button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-sm font-medium text-slate-400"
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

      <Button variant="secondary" full size="lg" onClick={() => nav(-1)}>
        Done
      </Button>
    </div>
  )
}
