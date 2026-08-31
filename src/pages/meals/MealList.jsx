import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'
import { MEAL_TAGS, normalizeMealName } from '../../lib/catalog.js'
import { Button, Input, Spinner } from '../../components/ui.jsx'

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'household', label: 'Household rating' },
  { key: 'mine', label: 'Your rating' },
  { key: 'untried', label: 'Not tried' },
]

const fmt1 = (x) => Number(x).toFixed(1)
const cx = (...xs) => xs.filter(Boolean).join(' ')

// tri-state cycle: off (0) -> only these (1) -> exclude these (-1) -> off
const nextState = (v) => (v === 1 ? -1 : v === -1 ? 0 : 1)

// Keep the list's search + filters through a tap into a meal and back.
const FILTERS_KEY = 'meal-list-filters'
const loadFilters = () => {
  try {
    return JSON.parse(sessionStorage.getItem(FILTERS_KEY) || '{}')
  } catch {
    return {}
  }
}

function FilterChip({ label, state = 0, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state !== 0}
      title={
        state === 1 ? `Only: ${label}` : state === -1 ? `Hide: ${label}` : label
      }
      className={cx(
        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        state === 1 && 'bg-emerald-500 text-slate-950',
        state === 0 && 'bg-slate-800 text-slate-400',
        state === -1 &&
          'filter-slash bg-slate-800 text-slate-300 ring-1 ring-inset ring-slate-400',
      )}
    >
      {label}
    </button>
  )
}

export default function MealList() {
  const { user } = useAuth()
  const { activeId } = useHousehold()
  const saved = useRef(loadFilters()).current
  const [q, setQ] = useState(saved.q ?? '')
  const [sort, setSort] = useState(saved.sort ?? 'name')
  // tri-state filters: 1 = only these · 0 = off · -1 = exclude these
  const [fMultiMenu, setFMultiMenu] = useState(saved.fMultiMenu ?? 0)
  const [fPicked, setFPicked] = useState(saved.fPicked ?? 0)
  const [fAddon, setFAddon] = useState(saved.fAddon ?? 0)
  const [tagState, setTagState] = useState(saved.tagState ?? {}) // tag -> 1 | -1
  const [seenDays, setSeenDays] = useState(saved.seenDays ?? 0)

  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          q,
          sort,
          fMultiMenu,
          fPicked,
          fAddon,
          tagState,
          seenDays,
        }),
      )
    } catch {
      /* storage unavailable — filters just won't persist */
    }
  }, [q, sort, fMultiMenu, fPicked, fAddon, tagState, seenDays])

  const cycleTag = (t) =>
    setTagState((cur) => {
      const n = { ...cur }
      const v = nextState(cur[t] ?? 0)
      if (v === 0) delete n[t]
      else n[t] = v
      return n
    })
  const [meals, setMeals] = useState([])
  const [hh, setHh] = useState({})
  const [mine, setMine] = useState({})
  const [picked, setPicked] = useState(new Set())
  const [brokenImg, setBrokenImg] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const debounce = useRef(null)

  useEffect(() => {
    clearTimeout(debounce.current)
    setLoading(true)
    debounce.current = setTimeout(async () => {
      let query = supabase
        .from('meals')
        .select(
          'id, name, tags, image_url, menu_appearances, menu_last_seen, providers(name)',
        )
        .limit(400)
      const term = normalizeMealName(q)
      if (term) query = query.ilike('normalized_name', `%${term}%`)

      const [mealRes, hhRes, mineRes, pickedRes] = await Promise.all([
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
        activeId
          ? supabase
              .from('v_meal_household_last_had')
              .select('meal_id')
              .eq('household_id', activeId)
          : Promise.resolve({ data: [] }),
      ])

      setMeals(mealRes.data ?? [])
      setHh(Object.fromEntries((hhRes.data ?? []).map((r) => [r.meal_id, r])))
      setPicked(new Set((pickedRes.data ?? []).map((r) => r.meal_id)))
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
  }, [q, activeId, user.id])

  const sorted = useMemo(() => {
    let rows = [...meals]
    const keep = (state, pred) =>
      state === 0 || (state === 1 ? pred : !pred)
    const incTags = []
    const excTags = []
    for (const [k, v] of Object.entries(tagState))
      (v === 1 ? incTags : excTags).push(k)
    rows = rows.filter((m) => {
      const mt = m.tags ?? []
      if (incTags.length && !incTags.some((x) => mt.includes(x))) return false
      if (excTags.some((x) => mt.includes(x))) return false
      return (
        keep(fPicked, picked.has(m.id) && mine[m.id] == null) &&
        keep(fMultiMenu, (m.menu_appearances ?? 0) >= 2) &&
        keep(fAddon, mt.includes('add-on'))
      )
    })
    if (seenDays) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - seenDays)
      rows = rows.filter(
        (m) => m.menu_last_seen && new Date(m.menu_last_seen) >= cutoff,
      )
    }
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
  }, [
    meals,
    sort,
    hh,
    mine,
    picked,
    fPicked,
    fMultiMenu,
    fAddon,
    tagState,
    seenDays,
  ])

  const anyFilter =
    fMultiMenu ||
    fPicked ||
    fAddon ||
    seenDays ||
    Object.keys(tagState).length > 0

  function resetFilters() {
    setFMultiMenu(0)
    setFPicked(0)
    setFAddon(0)
    setTagState({})
    setSeenDays(0)
  }

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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <label className="flex items-center gap-1.5 text-slate-500">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort meals"
            className="rounded-md border border-slate-700 bg-slate-900 py-1 pl-2 pr-6 text-xs text-slate-200 outline-none focus:border-emerald-500"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-500">
          Seen
          <select
            value={seenDays}
            onChange={(e) => setSeenDays(Number(e.target.value))}
            aria-label="Seen on a menu within"
            className="rounded-md border border-slate-700 bg-slate-900 py-1 pl-2 pr-6 text-xs text-slate-200 outline-none focus:border-emerald-500"
          >
            <option value={0}>any time</option>
            <option value={30}>last 30 days</option>
            <option value={60}>last 60 days</option>
            <option value={90}>last 90 days</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          ['2+ menus', fMultiMenu, setFMultiMenu],
          ['Picked, unrated', fPicked, setFPicked],
          ['Add-ons', fAddon, setFAddon],
        ].map(([label, state, setState]) => (
          <FilterChip
            key={label}
            label={label}
            state={state}
            onClick={() => setState(nextState)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {MEAL_TAGS.map((t) => (
          <FilterChip
            key={t}
            label={t}
            state={tagState[t] ?? 0}
            onClick={() => cycleTag(t)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {sorted.length} {sorted.length === 1 ? 'meal' : 'meals'}
        </span>
        {anyFilter ? (
          <button
            type="button"
            onClick={resetFilters}
            className="font-medium text-emerald-400 hover:text-emerald-300"
          >
            Reset
          </button>
        ) : null}
      </div>

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
                  className="flex items-center gap-3 py-3"
                >
                  {m.image_url && !brokenImg.has(m.id) ? (
                    <img
                      src={m.image_url}
                      alt=""
                      loading="lazy"
                      onError={() =>
                        setBrokenImg((s) => new Set(s).add(m.id))
                      }
                      className="h-11 w-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-11 w-11 shrink-0 rounded-lg bg-slate-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-slate-100">{m.name}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {[
                        m.tags?.length ? m.tags.join(' · ') : null,
                        m.menu_appearances >= 2
                          ? `${m.menu_appearances} menus`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </div>
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
