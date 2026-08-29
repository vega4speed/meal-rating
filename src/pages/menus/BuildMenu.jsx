import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { normalizeMealName } from '../../lib/catalog.js'
import { formatWeekOf } from '../../lib/week.js'
import {
  Button,
  Card,
  Input,
  Select,
  Segmented,
  SectionHeading,
  Pill,
  Spinner,
  ErrorText,
} from '../../components/ui.jsx'
import BackLink from '../../components/BackLink.jsx'
import PasteImport from './PasteImport.jsx'
import PdfImport from './PdfImport.jsx'

export default function BuildMenu() {
  const { menuId } = useParams()
  const [menu, setMenu] = useState(null)
  const [items, setItems] = useState([])
  const [varsByMeal, setVarsByMeal] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [method, setMethod] = useState('search')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const debounce = useRef(null)

  const load = useCallback(async () => {
    const menuRes = await supabase
      .from('weekly_menus')
      .select('id, week_of, status, household_id')
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

  const onMenuMealIds = new Set(
    items.map((it) => it.meal_variations?.meal_id).filter(Boolean),
  )

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

  if (loading) return <Spinner />
  if (!menu) return <p className="py-8 text-sm text-slate-500">Menu not found.</p>

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/">This week</BackLink>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            {formatWeekOf(menu.week_of)}
          </h1>
          <div className="mt-1">
            <Pill tone={menu.status === 'published' ? 'emerald' : 'amber'}>
              {menu.status}
            </Pill>
          </div>
        </div>
        {menu.status === 'draft' ? (
          <Button
            size="sm"
            onClick={() => setStatus('published')}
            disabled={busy || items.length === 0}
          >
            Publish
          </Button>
        ) : (
          <div className="flex gap-2">
            <Link to={`/menus/${menu.id}`}>
              <Button size="sm" variant="secondary">
                View
              </Button>
            </Link>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setStatus('draft')}
              disabled={busy}
            >
              Unpublish
            </Button>
          </div>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      <section className="flex flex-col gap-2">
        <SectionHeading>On the menu · {items.length}</SectionHeading>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing added yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it, idx) => {
              const meal = it.meal_variations?.meals
              const vars = varsByMeal[it.meal_variations?.meal_id] ?? []
              return (
                <Card as="li" key={it.id} className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-slate-100">
                      {meal?.name}
                    </span>
                    <div className="flex shrink-0 items-center">
                      <button
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                        className="flex h-9 w-9 items-center justify-center text-slate-400 disabled:opacity-25"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(idx, 1)}
                        disabled={idx === items.length - 1}
                        aria-label="Move down"
                        className="flex h-9 w-9 items-center justify-center text-slate-400 disabled:opacity-25"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeItem(it.id)}
                        aria-label="Remove"
                        className="flex h-9 w-9 items-center justify-center text-rose-400"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {vars.length > 1 ? (
                    <Select
                      value={it.variation_id}
                      onChange={(e) => changeVariation(it.id, e.target.value)}
                    >
                      {vars.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </Card>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Add meals</SectionHeading>
        <Segmented
          value={method}
          onChange={setMethod}
          options={[
            { value: 'search', label: 'Search' },
            { value: 'paste', label: 'Paste' },
            { value: 'pdf', label: 'PDF' },
          ]}
        />

        {method === 'search' ? (
          <div className="flex flex-col gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the catalog"
            />
            {results.length ? (
              <ul className="flex flex-col divide-y divide-slate-800">
                {results.map((r) => {
                  const on = onMenuMealIds.has(r.id)
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="text-sm text-slate-200">{r.name}</span>
                      <Button
                        size="sm"
                        variant={on ? 'secondary' : 'primary'}
                        onClick={() => addMeal(r.id)}
                        disabled={busy || on}
                      >
                        {on ? 'Added' : 'Add'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : q.trim() ? (
              <p className="text-sm text-slate-500">No matches.</p>
            ) : null}
          </div>
        ) : method === 'paste' ? (
          <PasteImport menuId={menuId} onDone={load} />
        ) : (
          <PdfImport menuId={menuId} onDone={load} />
        )}
      </section>
    </div>
  )
}
