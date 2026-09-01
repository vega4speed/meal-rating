import { useCallback, useEffect, useRef, useState } from 'react'
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

const isAddon = (meal) => (meal?.tags ?? []).includes('add-on')

function ListGlyph(props) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M3 4.5h12M3 9h12M3 13.5h12" />
      </g>
    </svg>
  )
}

function CarouselGlyph(props) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden {...props}>
      <rect
        x="5"
        y="3"
        width="8"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M2.5 5v8M15.5 5v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

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
  const [editingPicks, setEditingPicks] = useState(false)
  const [view, setView] = useState('list') // order mode: 'list' | 'carousel'
  const [carIndex, setCarIndex] = useState(0)
  const stripRef = useRef(null)

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
        'id, position, variation_id, meal_variations(id, label, calories, fat_g, protein_g, carbs_g, meal_id, meals(id, name, description, tags, image_url, menu_appearances, price_cents))',
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

  // Jump the carousel strip to the tapped meal when it opens.
  useEffect(() => {
    if (view !== 'carousel') return
    const el = stripRef.current
    if (!el) return
    const id = requestAnimationFrame(() => {
      el.scrollLeft = carIndex * el.clientWidth
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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

  function toggleEditPicks() {
    const next = !editingPicks
    setEditingPicks(next)
    if (next) setShowOthers(true) // reveal the full menu to mark from
  }

  async function rateMeal(it, score) {
    const v = it.meal_variations
    if (!v?.id) return
    setMine((cur) => ({ ...cur, [v.id]: score }))
    // rating a meal in the rate view means you had it — mark it picked too
    const autoPick = !myPick(it.id)
    if (autoPick) patchMyPick(it.id, 1)
    setBusyItem(it.id)
    await supabase
      .from('ratings')
      .upsert(
        { user_id: user.id, variation_id: v.id, score },
        { onConflict: 'user_id,variation_id' },
      )
    if (autoPick)
      await supabase
        .from('menu_selections')
        .upsert(
          { menu_item_id: it.id, user_id: user.id, qty: 1 },
          { onConflict: 'menu_item_id,user_id' },
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

  // Carousel browses the main meals (everything that isn't an add-on), in menu
  // order regardless of the list's rating-rank sort.
  const carouselItems = [...items]
    .filter((it) => !isAddon(it.meal_variations?.meals))
    .sort((a, b) => a.position - b.position)

  function openCarousel(itemId) {
    const i = carouselItems.findIndex((c) => c.id === itemId)
    if (i < 0) return
    setCarIndex(i)
    setView('carousel')
  }

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
    const detailTap = !rating && !isAddon(meal) // opens the carousel

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
            {detailTap ? (
              <button
                type="button"
                onClick={() => openCarousel(it.id)}
                className="truncate text-left font-medium text-slate-100"
              >
                {meal?.name}
              </button>
            ) : (
              <Link
                to={`/meals/${meal?.id}`}
                className="truncate font-medium text-slate-100"
              >
                {meal?.name}
              </Link>
            )}
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

          {(rating ? others.length : pickers.length) ? (
            <div className="text-xs text-emerald-300/80">
              {[
                !rating && myItemPick
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
            <>
              <StarRating
                value={myScore}
                onRate={(n) => rateMeal(it, n)}
                size="md"
              />
              {editingPicks ? (
                <button
                  type="button"
                  disabled={busyItem === it.id}
                  aria-pressed={!!myItemPick}
                  onClick={() => togglePick(it.id)}
                  className={cx(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                    myItemPick
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-800 text-slate-400',
                  )}
                >
                  {myItemPick ? '✓ I had this' : 'I had this'}
                </button>
              ) : null}
            </>
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
            detailTap ? (
              <button
                type="button"
                onClick={() => openCarousel(it.id)}
                aria-label={`${meal.name} — details`}
                className="rounded-lg ring-1 ring-slate-700/70"
              >
                <img
                  src={meal.image_url}
                  alt=""
                  loading="lazy"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              </button>
            ) : (
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
            )
          ) : null}
        </div>
      </Card>
    )
  }

  function renderCarousel() {
    const n = carouselItems.length
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setView('list')}
          aria-label="Back to list"
          className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/80 text-lg text-slate-300 backdrop-blur"
        >
          ✕
        </button>

        <div
          ref={stripRef}
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.clientWidth)
              setCarIndex(Math.round(el.scrollLeft / el.clientWidth))
          }}
          className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {carouselItems.map((it) => {
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
            const mp = myPick(it.id)
            const qty = totalQty(it.id)
            return (
              <div key={it.id} className="w-full shrink-0 snap-center pr-0.5">
                <div className="flex flex-col gap-3">
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-800">
                    {meal?.image_url ? (
                      <img
                        src={meal.image_url}
                        alt={meal.name}
                        onError={(e) =>
                          (e.currentTarget.style.display = 'none')
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl">
                        🍽️
                      </div>
                    )}
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">
                      {meal?.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {v?.label && v.label !== 'Standard' ? `${v.label} · ` : ''}
                      {macroLine(v) ?? 'Macros not listed'}
                    </p>
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
                      <span className="text-slate-500">
                        No household ratings yet
                      </span>
                    )}
                    {myScore != null ? (
                      <span className="flex items-center gap-1 text-slate-400">
                        you <StarRating value={myScore} readOnly size="sm" />
                      </span>
                    ) : null}
                  </div>

                  {meal?.description ? (
                    <p className="text-sm leading-relaxed text-slate-300">
                      {meal.description}
                    </p>
                  ) : null}

                  {mp ? (
                    <div className="flex items-center justify-between rounded-xl bg-emerald-500 text-slate-950">
                      <button
                        aria-label="Fewer"
                        disabled={busyItem === it.id}
                        onClick={() => changeQty(it.id, -1)}
                        className="flex h-12 w-14 items-center justify-center text-2xl font-bold disabled:opacity-50"
                      >
                        −
                      </button>
                      <span className="text-base font-bold">{qty} picked</span>
                      <button
                        aria-label="More"
                        disabled={busyItem === it.id || mp.qty >= 20}
                        onClick={() => changeQty(it.id, 1)}
                        className="flex h-12 w-14 items-center justify-center text-2xl font-bold disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busyItem === it.id}
                      onClick={() => togglePick(it.id)}
                      className="rounded-xl bg-slate-800 py-3 text-base font-semibold text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-60"
                    >
                      Pick this
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-2 text-center text-xs text-slate-500">
          {Math.min(carIndex + 1, n)} / {n} · swipe for more
        </p>
      </div>
    )
  }

  const showViewToggle =
    !rating && ranked.length > 0 && carouselItems.length > 0

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
        <div className="flex shrink-0 items-center gap-2">
          {showViewToggle ? (
            <div className="flex rounded-lg bg-slate-800 p-0.5">
              {[
                ['list', 'List view', ListGlyph],
                ['carousel', 'Carousel view', CarouselGlyph],
              ].map(([key, label, Glyph]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={cx(
                    'flex h-7 w-8 items-center justify-center rounded-md transition-colors',
                    view === key
                      ? 'bg-slate-700 text-slate-100'
                      : 'text-slate-500',
                  )}
                >
                  <Glyph />
                </button>
              ))}
            </div>
          ) : null}
          <Link
            to={`/menus/${menu.id}/edit`}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100"
          >
            Edit
          </Link>
        </div>
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
      ) : !rating && view === 'carousel' ? (
        renderCarousel()
      ) : rating ? (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <SectionHeading
              action={
                <button
                  type="button"
                  onClick={toggleEditPicks}
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  {editingPicks ? 'Done' : 'Edit picks'}
                </button>
              }
            >
              Your picks{pickedItems.length ? ` · ${pickedItems.length}` : ''}
            </SectionHeading>
            {pickedItems.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {pickedItems.map(renderItem)}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                {editingPicks
                  ? 'Tap “I had this” on the meals you got.'
                  : 'Nothing logged — tap Edit picks, or just rate what you ate.'}
              </p>
            )}
          </section>

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
