import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { normalizeMealName } from '../../lib/catalog.js'
import { formatWeekOf } from '../../lib/week.js'
import { Input } from '../../components/ui.jsx'
import BackLink from '../../components/BackLink.jsx'
import PasteImport from './PasteImport.jsx'

export default function BuildMenu() {
  const { menuId } = useParams()
  const { user } = useAuth()
  const [menu, setMenu] = useState(null)
  const [items, setItems] = useState([])
  const [varsByMeal, setVarsByMeal] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const debounce = useRef(null)

  const load = useCallback(async () => {
    const menuRes = await supabase
      .from('weekly_menus')
      .select('id, week_of, status, household_id, published_at')
      .eq('id', menuId)
      .maybeSingle()
    setMenu(menuRes.data ?? null)

    const itemRes = await supabase
      .from('weekly_menu_items')
      .select(
        'id, position, variation_id, meal_variations(id, label, meal_id, meals(id, name))',
      )
      .eq('menu_id', menuId)
      .order('position', { ascending: true })
    const its = itemRes.data ?? []
    setItems(its)

    const mealIds = [
      ...new Set(its.map((i) => i.meal_variations?.meal_id).filter(Boolean)),
    ]
    if (mealIds.length) {
      const { data } = await supabase
        .from('meal_variations')
        .select('id, label, meal_id')
        .in('meal_id', mealIds)
        .order('created_at', { ascending: true })
      const map = {}
      for (const v of data ?? []) (map[v.meal_id] ||= []).push(v)
      setVarsByMeal(map)
    }
    setLoading(false)
  }, [menuId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    clearTimeout(debounce.current)
    const term = normalizeMealName(q)
    if (!term) {
      setResults([])
      return
    }
    debounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('meals')
        .select('id, name')
        .ilike('normalized_name', `%${term}%`)
        .order('name')
        .limit(15)
      setResults(data ?? [])
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [q])

  async function addMeal(mealId) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('add_menu_items', {
      p_menu_id: menuId,
      p_meal_ids: [mealId],
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setQ('')
      setResults([])
      await load()
    }
  }

  async function removeItem(itemId) {
    await supabase.from('weekly_menu_items').delete().eq('id', itemId)
    await load()
  }

  async function changeVariation(itemId, variationId) {
    const { error } = await supabase
      .from('weekly_menu_items')
      .update({ variation_id: variationId })
      .eq('id', itemId)
    if (error) setError(error.message)
    await load()
  }

  async function move(idx, dir) {
    const a = items[idx]
    const b = items[idx + dir]
    if (!a || !b) return
    await Promise.all([
      supabase
        .from('weekly_menu_items')
        .update({ position: b.position })
        .eq('id', a.id),
      supabase
        .from('weekly_menu_items')
        .update({ position: a.position })
        .eq('id', b.id),
    ])
    await load()
  }

  async function setStatus(status) {
    setBusy(true)
    await supabase
      .from('weekly_menus')
      .update({
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      .eq('id', menuId)
    setBusy(false)
    await load()
  }

  if (loading) return <p className="py-8 text-sm text-slate-500">Loading…</p>
  if (!menu) return <p className="py-8 text-sm text-slate-500">Menu not found.</p>

  return (
    <div className="flex flex-col gap-5 py-2">
      <BackLink to="/" children="This week" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            {formatWeekOf(menu.week_of)}
          </h1>
          <span className="text-xs text-slate-500">{menu.status}</span>
        </div>
        {menu.status === 'draft' ? (
          <button
            onClick={() => setStatus('published')}
            disabled={busy || items.length === 0}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            Publish
          </button>
        ) : (
          <div className="flex gap-2">
            <Link
              to={`/menus/${menu.id}`}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200"
            >
              View
            </Link>
            <button
              onClick={() => setStatus('draft')}
              disabled={busy}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200"
            >
              Unpublish
            </button>
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">
          On the menu ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing added yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-800">
            {items.map((it, idx) => {
              const meal = it.meal_variations?.meals
              const vars = varsByMeal[it.meal_variations?.meal_id] ?? []
              return (
                <li key={it.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-100">{meal?.name}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        className="text-slate-400 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(idx, 1)}
                        disabled={idx === items.length - 1}
                        className="text-slate-400 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeItem(it.id)}
                        className="font-medium text-rose-400"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {vars.length > 1 ? (
                    <select
                      value={it.variation_id}
                      onChange={(e) => changeVariation(it.id, e.target.value)}
                      className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                    >
                      {vars.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">Add from catalog</h2>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search meals"
        />
        {results.length ? (
          <ul className="flex flex-col divide-y divide-slate-800">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between py-2"
              >
                <span className="text-sm text-slate-200">{r.name}</span>
                <button
                  onClick={() => addMeal(r.id)}
                  disabled={busy}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <PasteImport
        menuId={menuId}
        householdId={menu.household_id}
        userId={user.id}
        onDone={load}
      />
    </div>
  )
}
