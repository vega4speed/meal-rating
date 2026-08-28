import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'
import { MEAL_TAGS, normalizeMealName } from '../../lib/catalog.js'
import { Input } from '../../components/ui.jsx'
import TagChips from '../../components/TagChips.jsx'

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'household', label: 'Household rating' },
  { key: 'mine', label: 'Your rating' },
  { key: 'untried', label: 'Not tried' },
]

export default function MealList() {
  const { user } = useAuth()
  const { activeId } = useHousehold()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const [sort, setSort] = useState('name')
  const [meals, setMeals] = useState([])
  const [hh, setHh] = useState({})
  const [mine, setMine] = useState({})
  const [loading, setLoading] = useState(true)
  const debounce = useRef(null)

  useEffect(() => {
    clearTimeout(debounce.current)
    setLoading(true)
    debounce.current = setTimeout(async () => {
      let query = supabase
        .from('meals')
        .select('id, name, tags, providers(name)')
        .limit(300)
      const term = normalizeMealName(q)
      if (term) query = query.ilike('normalized_name', `%${term}%`)
      if (tag) query = query.contains('tags', [tag])

      const [mealRes, hhRes, mineRes] = await Promise.all([
        query,
        activeId
          ? supabase
              .from('v_meal_household_stats')
              .select('meal_id, avg_score, rating_count, rater_count')
              .eq('household_id', activeId)
          : Promise.resolve({ data: [] }),
        supabase
          .from('ratings')
          .select('score, meal_variations(meal_id)')
          .eq('user_id', user.id),
      ])

      setMeals(mealRes.data ?? [])
      setHh(
        Object.fromEntries((hhRes.data ?? []).map((r) => [r.meal_id, r])),
      )
      const byMeal = {}
      for (const r of mineRes.data ?? []) {
        const mid = r.meal_variations?.meal_id
        if (!mid) continue
        ;(byMeal[mid] ||= []).push(r.score)
      }
      setMine(
        Object.fromEntries(
          Object.entries(byMeal).map(([mid, scores]) => [
            mid,
            scores.reduce((a, b) => a + b, 0) / scores.length,
          ]),
        ),
      )
      setLoading(false)
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [q, tag, activeId, user.id])

  const sorted = useMemo(() => {
    const rows = [...meals]
    if (sort === 'name') {
      rows.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === 'household') {
      rows.sort(
        (a, b) => (hh[b.id]?.avg_score ?? -1) - (hh[a.id]?.avg_score ?? -1),
      )
    } else if (sort === 'mine') {
      rows.sort((a, b) => (mine[b.id] ?? -1) - (mine[a.id] ?? -1))
    } else if (sort === 'untried') {
      rows.sort(
        (a, b) =>
          (mine[a.id] != null ? 1 : 0) - (mine[b.id] != null ? 1 : 0) ||
          a.name.localeCompare(b.name),
      )
    }
    return rows
  }, [meals, sort, hh, mine])

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Meals</h1>
        <Link
          to="/meals/new"
          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950"
        >
          Add meal
        </Link>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search meals"
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Sort</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <TagChips
        options={MEAL_TAGS}
        selected={tag}
        single
        onToggle={(t) => setTag((cur) => (cur === t ? null : t))}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-slate-500">No meals match.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800">
          {sorted.map((m) => {
            const h = hh[m.id]
            const mineAvg = mine[m.id]
            return (
              <li key={m.id}>
                <Link
                  to={`/meals/${m.id}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <div className="text-slate-100">{m.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {m.providers?.name}
                      {m.tags?.length ? ` · ${m.tags.join(', ')}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {h ? (
                      <div className="text-amber-400">
                        ★ {h.avg_score}
                        <span className="text-slate-600"> ({h.rater_count})</span>
                      </div>
                    ) : (
                      <div className="text-slate-600">unrated</div>
                    )}
                    {mineAvg != null ? (
                      <div className="text-slate-500">
                        you {mineAvg.toFixed(1)}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
