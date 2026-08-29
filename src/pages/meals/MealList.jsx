import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'
import { MEAL_TAGS, normalizeMealName } from '../../lib/catalog.js'
import { Button, Input, Select, Spinner } from '../../components/ui.jsx'
import TagChips from '../../components/TagChips.jsx'

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'household', label: 'Household rating' },
  { key: 'mine', label: 'Your rating' },
  { key: 'untried', label: 'Not tried' },
]

const fmt1 = (x) => Number(x).toFixed(1)

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
      setHh(Object.fromEntries((hhRes.data ?? []).map((r) => [r.meal_id, r])))
      const byMeal = {}
      for (const r of mineRes.data ?? []) {
        const mid = r.meal_variations?.meal_id
        if (!mid) continue
        ;(byMeal[mid] ||= []).push(r.score)
      }
      setMine(
        Object.fromEntries(
          Object.entries(byMeal).map(([mid, s]) => [
            mid,
            s.reduce((a, b) => a + b, 0) / s.length,
          ]),
        ),
      )
      setLoading(false)
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [q, tag, activeId, user.id])

  const sorted = useMemo(() => {
    const rows = [...meals]
    if (sort === 'household')
      rows.sort(
        (a, b) => (hh[b.id]?.avg_score ?? -1) - (hh[a.id]?.avg_score ?? -1),
      )
    else if (sort === 'mine')
      rows.sort((a, b) => (mine[b.id] ?? -1) - (mine[a.id] ?? -1))
    else if (sort === 'untried')
      rows.sort(
        (a, b) =>
          (mine[a.id] != null ? 1 : 0) - (mine[b.id] != null ? 1 : 0) ||
          a.name.localeCompare(b.name),
      )
    else rows.sort((a, b) => a.name.localeCompare(b.name))
    return rows
  }, [meals, sort, hh, mine])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Meals</h1>
        <Link to="/meals/new">
          <Button size="sm">Add meal</Button>
        </Link>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search meals"
      />

      <div className="flex items-center gap-3">
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="w-auto"
          aria-label="Sort meals"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <TagChips
        options={MEAL_TAGS}
        selected={tag}
        single
        onToggle={(t) => setTag((cur) => (cur === t ? null : t))}
      />

      {loading ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No meals match.</p>
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
                  <div className="min-w-0">
                    <div className="truncate text-slate-100">{m.name}</div>
                    {m.tags?.length ? (
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {m.tags.join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    {mineAvg != null ? (
                      <span className="text-slate-500">
                        you {fmt1(mineAvg)}
                      </span>
                    ) : null}
                    {h ? (
                      <span className="rounded-lg bg-slate-800 px-2 py-1 font-medium text-amber-400">
                        ★ {fmt1(h.avg_score)}
                      </span>
                    ) : (
                      <span className="rounded-lg bg-slate-800/60 px-2 py-1 text-slate-500">
                        —
                      </span>
                    )}
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
