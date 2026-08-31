import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { formatWeekOf } from '../../lib/week.js'
import { macroLine } from '../../lib/catalog.js'
import { mealBadges } from '../../lib/badges.js'
import { orderTotalCents, usd, EXTRA_PROTEIN_CENTS } from '../../lib/pricing.js'
import { Card, Pill, Spinner, SectionHeading } from '../../components/ui.jsx'
import StarRating from '../../components/StarRating.jsx'

const fmt1 = (x) => (x == null ? null : Number(x).toFixed(1))
const cx = (...xs) => xs.filter(Boolean).join(' ')

// The variation label an order-level Extra Protein / Low Carb choice implies.
function targetLabel(ep, lc) {
  if (ep && lc) return 'Extra Protein + Low Carb'
  if (ep) return 'Extra Protein'
  if (lc) return 'Low Carb'
  return null
}

export default function WeekMenu({ menuId, mode = 'order' }) {
  const rating = mode === 'rate'
  const { user, profile } = useAuth()
  const [menu, setMenu] = useState(null)
  const [items, setItems] = useState([])
  const [varsByMeal, setVarsByMeal] = useState({}) // meal_id -> [{label, macros}]
  const [stats, setStats] = useState({})
  const [lastHad, setLastHad] = useState({})
  const [mine, setMine] = useState({})
  const [picks, setPicks] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyItem, setBusyItem] = useState(null)
  const [showOthers, setShowOthers] = useState(false)

  const load = useCallback(async () => {
    const menuRes = await supabase
      .from('weekly_menus')
      .select(
        'id, week_of, status, household_id, order_extra_protein, order_low_carb',
      )
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
        'id, position, variation_id, meal_variations(id, label, calories, fat_g, protein_g, carbs_g, meal_id, meals(id, name, tags, image_url, menu_appearances, price_cents))',
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

    const [statRes, mineRes, pickRes, lastRes, varRes] = await Promise.all([
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
      mealIds.length
        ? supabase
            .from('meal_variations')
            .select('meal_id, label, calories, fat_g, protein_g, carbs_g')
            .in('meal_id', mealIds)
        : Promise.resolve({ data: [] }),
    ])

    setStats(Object.fromEntries((statRes.data ?? []).map((r) => [r.variation_id, r])))
    setMine(
      Object.fromEntries((mineRes.data ?? []).map((r) => [r.variation_id, r.score])),
    )
    setLastHad(
      Object.fromEntries((lastRes.data ?? []).map((r) => [r.meal_id, r.last_week])),
    )
    const vbm = {}
    for (const row of varRes.data ?? []) (vbm[row.meal_id] ||= []).push(row)
    setVarsByMeal(vbm)

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
        list.push({ user_id: user.id, qty, display_name: profile?.display_name ?? 'You' })
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
    const mp = myPick(itemId)
    if (!mp) return
    const next = mp.qty + delta
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

  async function setOrderOpt(patch) {
    setMenu((cur) => ({ ...cur, ...patch }))
    await supabase.from('weekly_menus').update(patch).eq('id', menuId)
  }

  async function rateMeal(it, score) {
    const v = it.meal_variations
    if (!v?.id) return
    setMine((cur) => ({ ...cur, [v.id]: score }))
    setBusyItem(it.id)
    await supabase
      .from('ratings')
      .upsert(
        { user_id: user.id, variation_id: v.id, score },
        { onConflict: 'user_id,variation_id' },
      )
    setBusyItem(null)
    load()
  }

  if (loading) return <Spinner />
  if (!menu) return <p className="py-8 text-sm text-slate-500">Menu not found.</p>

  const ep = menu.order_extra_protein
  const lc = menu.order_low_carb
  const wantLabel = rating ? null : targetLabel(ep, lc)

  // Which variation's macros to show for an item, given the order-level choice.
  function effectiveVar(it) {
    const base = it.meal_variations
    if (!wantLabel) return base
    const alt = (varsByMeal[base?.meal_id] ?? []).find(
      (x) => x.label === wantLabel,
    )
    return alt
      ? { ...alt, label: alt.label, meals: base.meals, meal_id: base.meal_id }
      : base
  }

  const totalQty = (id) => (picks[id] ?? []).reduce((s, p) => s + (p.qty ?? 1), 0)

  const ranked = [...items].sort((a, b) => {
    if (rating) return a.position - b.position // menu order when rating
    const av = stats[a.variation_id]?.avg_score ?? -1
    const bv = stats[b.variation_id]?.avg_score ?? -1
    return bv - av || a.position - b.position
  })
  const pickedItems = ranked.filter((it) => totalQty(it.id) > 0)
  const openItems = ranked.filter((it) => totalQty(it.id) === 0)

  const order = orderTotalCents(
    pickedItems.map((it) => ({
      price_cents: it.meal_variations?.meals?.price_cents ?? null,
      qty: totalQty(it.id),
    })),
    { extraProtein: ep },
  )
  const pickedUnits = pickedItems.reduce((s, it) => s + totalQty(it.id), 0)

  function renderItem(it) {
    const meal = it.meal_variations?.meals
    const v = effectiveVar(it)
    const st = stats[it.variation_id]
    const myScore = mine[it.variation_id] ?? null
    const badges = mealBadges({
      householdAvg: st?.avg_score ?? null,
      ratingCount: st?.rating_count ?? 0,
      myScore,
      lastHadWeek: lastHad[meal?.id] ?? null,
      menuAppearances: meal?.menu_appearances ?? null,
    })
    const pickers = picks[it.id] ?? []
    const myItemPick = pickers.find((x) => x.user_id === user.id) ?? null
    const others = pickers.filter((x) => x.user_id !== user.id)
    const total = totalQty(it.id)

    return (
      <Card
        as="li"
        key={it.id}
        className={cx(
          'flex gap-3 p-3.5',
          !rating && total > 0 && 'border-emerald-500/40 bg-emerald-500/[0.06]',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            {!rating && total > 0 ? (
              <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500 px-1.5 text-sm font-bold text-slate-950">
                {total}
              </span>
            ) : null}
            <Link
              to={`/meals/${meal?.id}`}
              className="truncate font-medium text-slate-100"
            >
              {meal?.name}
            </Link>
          </div>

          {v?.label && v.label !== 'Standard' ? (
            <span className="-mt-1 text-xs text-slate-500">{v.label}</span>
          ) : null}
          {macroLine(v) ? (
            <div className="-mt-1 text-xs text-slate-500">{macroLine(v)}</div>
          ) : null}

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
                <span className="text-slate-500"> · {st.rating_count}</span>
              </span>
            ) : (
              <span className="text-slate-500">No ratings yet</span>
            )}
            {!rating && myScore != null ? (
              <span className="flex items-center gap-1 text-slate-400">
                you <StarRating value={myScore} readOnly size="sm" />
              </span>
            ) : null}
          </div>

          {pickers.length ? (
            <div className="text-xs text-emerald-300/80">
              {[
                myItemPick
                  ? `You${myItemPick.qty > 1 ? ` ×${myItemPick.qty}` : ''}`
                  : null,
                ...others.map(
                  (x) => `${x.display_name}${x.qty > 1 ? ` ×${x.qty}` : ''}`,
                ),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2.5">
          {rating ? (
            <StarRating
              value={myScore}
              onRate={(n) => rateMeal(it, n)}
              size="md"
            />
          ) : myItemPick ? (
            <div className="flex items-center gap-1 rounded-xl bg-emerald-500 text-slate-950">
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
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-60"
            >
              Pick
            </button>
          )}
          {meal?.image_url ? (
            <Link
              to={`/meals/${meal.id}`}
              aria-label={`${meal.name} photo`}
              className="rounded-lg ring-1 ring-slate-700/70"
            >
              <img
                src={meal.image_url}
                alt=""
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = 'none')}
                className="h-12 w-12 rounded-lg object-cover"
              />
            </Link>
          ) : null}
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            {formatWeekOf(menu.week_of)}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {rating ? 'Rate what you’re eating' : 'Pick meals · order by Sunday'}
          </p>
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
      ) : rating ? (
        <div className="flex flex-col gap-4">
          {pickedItems.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionHeading>
                Your picks · {pickedItems.length}
              </SectionHeading>
              <ul className="flex flex-col gap-3">
                {pickedItems.map(renderItem)}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-slate-500">
              No picks were logged for this week — expand the menu below to rate
              what you ate.
            </p>
          )}

          {openItems.length > 0 ? (
            <section className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={showOthers}
                onClick={() => setShowOthers((v) => !v)}
                className="flex items-center justify-between rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-slate-300"
              >
                <span>
                  {showOthers ? 'Hide' : 'Show'} the rest of the menu ·{' '}
                  {openItems.length}
                </span>
                <span className="text-slate-500">{showOthers ? '▲' : '▾'}</span>
              </button>
              {showOthers ? (
                <ul className="flex flex-col gap-3">
                  {openItems.map(renderItem)}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <>
          {pickedItems.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionHeading>
                Picked · {pickedItems.length}{' '}
                {pickedItems.length === 1 ? 'meal' : 'meals'}
              </SectionHeading>

              <Card className="flex flex-col gap-3 border-emerald-500/30 bg-emerald-500/[0.04]">
                <div className="flex flex-wrap gap-2">
                  {[
                    ['Extra Protein', ep, () =>
                      setOrderOpt({ order_extra_protein: !ep })],
                    ['Low Carb', lc, () => setOrderOpt({ order_low_carb: !lc })],
                  ].map(([label, on, toggle]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      onClick={toggle}
                      className={cx(
                        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                        on
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Whole order, set once — {ep ? 'Extra Protein adds ' : 'adds '}
                  {usd(EXTRA_PROTEIN_CENTS)}/meal when on.
                </p>

                <div className="flex items-end justify-between border-t border-slate-800 pt-3">
                  <div className="text-xs text-slate-500">
                    {order.mainCount} tier meal{order.mainCount === 1 ? '' : 's'}
                    {pickedUnits - order.mainCount > 0
                      ? ` + ${pickedUnits - order.mainCount} add-on`
                      : ''}
                    <br />@ {usd(order.perMainCents)}/meal
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-100">
                      {usd(order.subtotalCents)}
                    </div>
                    <div className="text-xs text-slate-500">before tax</div>
                  </div>
                </div>
              </Card>

              <ul className="flex flex-col gap-3">{pickedItems.map(renderItem)}</ul>
            </section>
          ) : null}

          {openItems.length > 0 ? (
            <section className="flex flex-col gap-2">
              {pickedItems.length > 0 ? (
                <SectionHeading>Not picked</SectionHeading>
              ) : null}
              <ul className="flex flex-col gap-3">{openItems.map(renderItem)}</ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
