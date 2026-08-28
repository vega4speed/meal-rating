import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { MEAL_TAGS, normalizeMealName } from '../../lib/catalog.js'
import { Input } from '../../components/ui.jsx'
import TagChips from '../../components/TagChips.jsx'

export default function MealList() {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const debounce = useRef(null)

  useEffect(() => {
    clearTimeout(debounce.current)
    setLoading(true)
    debounce.current = setTimeout(async () => {
      let query = supabase
        .from('meals')
        .select('id, name, tags, providers(name)')
        .order('name')
        .limit(200)
      const term = normalizeMealName(q)
      if (term) query = query.ilike('normalized_name', `%${term}%`)
      if (tag) query = query.contains('tags', [tag])
      const { data } = await query
      setMeals(data ?? [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [q, tag])

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

      <TagChips
        options={MEAL_TAGS}
        selected={tag}
        single
        onToggle={(t) => setTag((cur) => (cur === t ? null : t))}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : meals.length === 0 ? (
        <p className="text-sm text-slate-500">
          No meals yet. Add the first one.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800">
          {meals.map((m) => (
            <li key={m.id}>
              <Link to={`/meals/${m.id}`} className="block py-3">
                <div className="text-slate-100">{m.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {m.providers?.name}
                  {m.tags?.length ? ` · ${m.tags.join(', ')}` : ''}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
