import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { formatWeekOf } from '../../lib/week.js'
import { macroLine } from '../../lib/catalog.js'
import { mealBadges, BADGE_CLASSES } from '../../lib/badges.js'
import StarRating from '../../components/StarRating.jsx'

export default function WeekMenu({ menuId }) {
  const { user } = useAuth()
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
            .select('menu_item_id, user_id, profiles(display_name)')
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
        display_name: row.profiles?.display_name,
      })
    }
    setPicks(p)
    setLoading(false)
  }, [menuId, user.id])

  useEffect(() => {
    load()
  }, [load])

  async function togglePick(itemId) {
    setBusyItem(itemId)
    const mineHere = (picks[itemId] ?? []).some((x) => x.user_id === user.id)
    if (mineHere) {
      await supabase
        .from('menu_selections')
        .delete()
        .eq('menu_item_id', itemId)
        .eq('user_id', user.id)
    } else {
      await supabase
        .from('menu_selections')
        .insert({ menu_item_id: itemId, user_id: user.id })
    }
    await load()
    setBusyItem(null)
  }

  if (loading) return <p className="py-8 text-sm text-slate-500">Loading…</p>
  if (!menu) return <p className="py-8 text-sm text-slate-500">Menu not found.</p>

  const ranked = [...items].sort((a, b) => {
    const av = stats[a.variation_id]?.avg_score ?? -1
    const bv = stats[b.variation_id]?.avg_score ?? -1
    return bv - av || a.position - b.position
  })

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            {formatWeekOf(menu.week_of)}
          </h1>
          <span
            className={[
              'text-xs font-medium',
              menu.status === 'published'
                ? 'text-emerald-400'
                : 'text-amber-400',
            ].join(' ')}
          >
            {menu.status}
          </span>
        </div>
        <Link
          to={`/menus/${menu.id}/edit`}
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200"
        >
          Edit
        </Link>
      </div>

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
            const iPicked = pickers.some((x) => x.user_id === user.id)
            return (
              <li
                key={it.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-800 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
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
                      <div className="text-xs text-slate-500">{macroLine(v)}</div>
                    ) : null}
                  </div>
                  <button
                    disabled={busyItem === it.id}
                    onClick={() => togglePick(it.id)}
                    className={[
                      'shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40',
                      iPicked
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-200',
                    ].join(' ')}
                  >
                    {iPicked ? 'Picked' : 'Pick'}
                  </button>
                </div>

                {badges.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map((b) => (
                      <span
                        key={b.label}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${BADGE_CLASSES[b.tone]}`}
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="text-amber-400">
                    {st ? `★ ${st.avg_score} (${st.rating_count})` : 'unrated'}
                  </span>
                  {myScore != null ? (
                    <span className="flex items-center gap-1">
                      you <StarRating value={myScore} readOnly size="sm" />
                    </span>
                  ) : null}
                </div>

                {pickers.length ? (
                  <div className="text-xs text-slate-500">
                    Picked by {pickers.map((x) => x.display_name).join(', ')}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
