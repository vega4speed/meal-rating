import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { formatWeekOf } from '../../lib/week.js'
import { macroLine } from '../../lib/catalog.js'
import { mealBadges } from '../../lib/badges.js'
import { Card, Pill, Spinner } from '../../components/ui.jsx'
import StarRating from '../../components/StarRating.jsx'

const fmt1 = (x) => (x == null ? null : Number(x).toFixed(1))

export default function WeekMenu({ menuId }) {
  const { user, profile } = useAuth()
  const [menu, setMenu] = useState(null)
  const [items, setItems] = useState([])
  const [stats, setStats] = useState({})
  const [lastHad, setLastHad] = useState({})
  const [mine, setMine] = useState({})
  const [picks, setPicks] = useState({}) // item_id -> [{user_id, display_name}]
  const [loading, setLoading] = useState(true)
  const [busyItem, setBusyItem] = useState(null)

  const load = useCallback(async () => {
    const menuRes = await supabase
      .from('weekly_menus')
      .select('id, week_of, status, household_id, published_at')
      .eq('id', menuId)
      .maybeSingle()
    const m = menuRes.data
    setMenu(m ?? null)
    if (!m) {
      setLoading(false)
      return
    }

    const itemRes = await supabase
      .from('weekly_menu_items')
      .select(
        'id, position, variation_id, meal_variations(id, label, calories, fat_g, protein_g, carbs_g, meal_id, meals(id, name, tags))',
      )
      .eq('menu_id', menuId)
      .order('position', { ascending: true })
    const its = itemRes.data ?? []
    setItems(its)

    const varIds = its.map((i) => i.variation_id)
    const itemIds = its.map((i) => i.id)
    const mealIds = [
      ...new Set(its.map((i) => i.meal_variations?.meal_id).filter(Boolean)),
    ]

    const [statRes, mineRes, pickRes, lastRes] = await Promise.all([
      varIds.length
        ? supabase
            .from('v_variation_household_stats')
            .select('variation_id, avg_score, rating_count')
            .eq('household_id', m.household_id)
            .in('variation_id', varIds)
        : Promise.resolve({ data: [] }),
      varIds.length
        ? supabase
            .from('ratings')
            .select('variation_id, score')
            .eq('user_id', user.id)
            .in('variation_id', varIds)
        : Promise.resolve({ data: [] }),
      itemIds.length
        ? supabase
            .from('menu_selections')
            .select('menu_item_id, user_id, qty, profiles(display_name)')
            .in('menu_item_id', itemIds)
        : Promise.resolve({ data: [] }),
      mealIds.length
        ? supabase
            .from('v_meal_household_last_had')
            .select('meal_id, last_week')
            .eq('household_id', m.household_id)
            .in('meal_id', mealIds)
        : Promise.resolve({ data: [] }),
    ])

    setStats(
      Object.fromEntries(
        (statRes.data ?? []).map((r) => [r.variation_id, r]),
      ),
    )
    setMine(
      Object.fromEntries((mineRes.data ?? []).map((r) => [r.variation_id, r.score])),
    )
    setLastHad(
      Object.fromEntries(
        (lastRes.data ?? []).map((r) => [r.meal_id, r.last_week]),
      ),
    )
    const p = {}
    for (const row of pickRes.data ?? []) {
      ;(p[row.menu_item_id] ||= []).push({
        user_id: row.user_id,
        qty: row.qty ?? 1,
        display_name: row.profiles?.display_name,
      })
    }
    setPicks(p)
    setLoading(false)
  }, [menuId, user.id])

  useEffect(() => {
    load()
  }, [load])

  function myPick(itemId) {
    return (picks[itemId] ?? []).find((x) => x.user_id === user.id) ?? null
  }

  function patchMyPick(itemId, qty) {
    setPicks((cur) => {
      const list = (cur[itemId] ?? []).filter((x) => x.user_id !== user.id)
      if (qty > 0)
        list.push({
          user_id: user.id,
          qty,
          display_name: profile?.display_name ?? 'You',
        })
      return { ...cur, [itemId]: list }
    })
  }

  async function togglePick(itemId) {
    const mine = myPick(itemId)
    patchMyPick(itemId, mine ? 0 : 1)
    setBusyItem(itemId)
    if (mine) {
      await supabase
        .from('menu_selections')
        .delete()
        .eq('menu_item_id', itemId)
        .eq('user_id', user.id)
    } else {
      await supabase
        .from('menu_selections')
        .insert({ menu_item_id: itemId, user_id: user.id, qty: 1 })
    }
    setBusyItem(null)
    load()
  }

  async function changeQty(itemId, delta) {
    const mine = myPick(itemId)
    if (!mine) return
    const next = mine.qty + delta
    if (next < 1) return togglePick(itemId)
    if (next > 20) return
    patchMyPick(itemId, next)
    setBusyItem(itemId)
    await supabase
      .from('menu_selections')
      .update({ qty: next })
      .eq('menu_item_id', itemId)
      .eq('user_id', user.id)
    setBusyItem(null)
    load()
  }

  if (loading) return <Spinner />
  if (!menu) return <p className="py-8 text-sm text-slate-500">Menu not found.</p>

  const ranked = [...items].sort((a, b) => {
    const av = stats[a.variation_id]?.avg_score ?? -1
    const bv = stats[b.variation_id]?.avg_score ?? -1
    return bv - av || a.position - b.position
  })

  return (
    <div className="flex flex-col gap-4">
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
        <Link
          to={`/menus/${menu.id}/edit`}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100"
        >
          Edit
        </Link>
      </div>

      {menu.status === 'draft' ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          This menu is a draft — publish it so the household can pick meals.
        </p>
      ) : null}

      {ranked.length === 0 ? (
        <p className="text-sm text-slate-500">
          No meals on this menu yet. Tap Edit to add some.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ranked.map((it) => {
            const v = it.meal_variations
            const meal = v?.meals
            const st = stats[it.variation_id]
            const myScore = mine[it.variation_id] ?? null
            const badges = mealBadges({
              householdAvg: st?.avg_score ?? null,
              ratingCount: st?.rating_count ?? 0,
              myScore,
              lastHadWeek: lastHad[v?.meal_id] ?? null,
            })
            const pickers = picks[it.id] ?? []
            const myItemPick =
              pickers.find((x) => x.user_id === user.id) ?? null
            const others = pickers.filter((x) => x.user_id !== user.id)
            return (
              <Card as="li" key={it.id} className="flex flex-col gap-2.5 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/meals/${meal?.id}`}
                      className="font-medium text-slate-100"
                    >
                      {meal?.name}
                    </Link>
                    {v?.label && v.label !== 'Standard' ? (
                      <span className="text-slate-500"> · {v.label}</span>
                    ) : null}
                    {macroLine(v) ? (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {macroLine(v)}
                      </div>
                    ) : null}
                  </div>
                  {myItemPick ? (
                    <div className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-500 text-slate-950">
                      <button
                        aria-label="Fewer"
                        disabled={busyItem === it.id}
                        onClick={() => changeQty(it.id, -1)}
                        className="flex h-9 w-9 items-center justify-center text-lg font-bold disabled:opacity-50"
                      >
                        −
                      </button>
                      <span className="min-w-[1.25rem] text-center text-sm font-bold">
                        {myItemPick.qty}
                      </span>
                      <button
                        aria-label="More"
                        disabled={busyItem === it.id || myItemPick.qty >= 20}
                        onClick={() => changeQty(it.id, 1)}
                        className="flex h-9 w-9 items-center justify-center text-lg font-bold disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={busyItem === it.id}
                      onClick={() => togglePick(it.id)}
                      className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-60"
                    >
                      Pick
                    </button>
                  )}
                </div>

                {badges.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map((b) => (
                      <Pill key={b.label} tone={b.tone}>
                        {b.label}
                      </Pill>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-center gap-3 text-xs">
                  {st ? (
                    <span className="font-medium text-amber-400">
                      ★ {fmt1(st.avg_score)}
                      <span className="text-slate-500">
                        {' '}
                        · {st.rating_count}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500">No ratings yet</span>
                  )}
                  {myScore != null ? (
                    <span className="flex items-center gap-1 text-slate-400">
                      you <StarRating value={myScore} readOnly size="sm" />
                    </span>
                  ) : null}
                </div>

                {pickers.length ? (
                  <div className="text-xs text-slate-500">
                    {[
                      myItemPick
                        ? `You${myItemPick.qty > 1 ? ` ×${myItemPick.qty}` : ''}`
                        : null,
                      ...others.map(
                        (x) =>
                          `${x.display_name}${x.qty > 1 ? ` ×${x.qty}` : ''}`,
                      ),
                    ]
                      .filter(Boolean)
                      .join(', ')}{' '}
                    picked this
                  </div>
                ) : null}
              </Card>
            )
          })}
        </ul>
      )}
    </div>
  )
}
