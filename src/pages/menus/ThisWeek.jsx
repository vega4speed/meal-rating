import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { menuWeeks, formatWeekOf } from '../../lib/week.js'
import { Button, Card, EmptyState, Spinner } from '../../components/ui.jsx'
import WeekMenu from './WeekMenu.jsx'

const cx = (...xs) => xs.filter(Boolean).join(' ')

export default function ThisWeek() {
  const nav = useNavigate()
  const { activeId, activeHousehold, loading: hhLoading } = useHousehold()
  const { thisWeek, nextWeek } = menuWeeks()
  const [tab, setTab] = useState('next') // 'next' = order · 'this' = rate
  const weekOf = tab === 'next' ? nextWeek : thisWeek

  const [view, setView] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!activeId) {
      setView({ status: 'nohousehold' })
      return
    }
    setView({ status: 'loading' })

    const [{ data: own }, { data: snap }] = await Promise.all([
      supabase
        .from('weekly_menus')
        .select('id')
        .eq('household_id', activeId)
        .eq('week_of', weekOf)
        .maybeSingle(),
      supabase
        .from('weekly_menus')
        .select('id')
        .is('household_id', null)
        .eq('week_of', weekOf)
        .maybeSingle(),
    ])

    if (own?.id) {
      // keep the household's menu in step with the week's Clean Eatz menu
      if (snap?.id) {
        await supabase.rpc('sync_menu_from_snapshot', {
          p_household_id: activeId,
          p_week_of: weekOf,
        })
      }
      setView({ status: 'menu', menuId: own.id })
      return
    }

    if (snap?.id) {
      const { data: items } = await supabase
        .from('weekly_menu_items')
        .select('position, meal_variations(meals(id, name, image_url))')
        .eq('menu_id', snap.id)
        .order('position', { ascending: true })
      setView({
        status: 'snapshot',
        meals: (items ?? [])
          .map((r) => r.meal_variations?.meals)
          .filter(Boolean),
      })
      return
    }
    setView({ status: 'empty' })
  }, [activeId, weekOf])

  useEffect(() => {
    load()
  }, [load])

  async function adopt() {
    setBusy(true)
    const { data, error } = await supabase.rpc('adopt_global_menu', {
      p_household_id: activeId,
      p_week_of: weekOf,
    })
    setBusy(false)
    if (!error && data?.id) setView({ status: 'menu', menuId: data.id })
  }

  async function build() {
    setBusy(true)
    const { data, error } = await supabase.rpc('ensure_weekly_menu', {
      p_household_id: activeId,
      p_week_of: weekOf,
    })
    setBusy(false)
    if (!error && data?.id) nav(`/menus/${data.id}/edit`)
  }

  if (hhLoading) return <Spinner />

  if (!activeId) {
    return (
      <EmptyState
        icon="🏠"
        title="No household yet"
        action={
          <Link to="/household">
            <Button>Get started</Button>
          </Link>
        }
      >
        Join or create a household to start tracking weekly menus and ratings.
      </EmptyState>
    )
  }

  const tabs = [
    { key: 'next', label: 'Next week', week: nextWeek, hint: 'order' },
    { key: 'this', label: 'This week', week: thisWeek, hint: 'rate' },
  ]

  return (
    <>
      <div className="flex flex-col gap-5 pb-10">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-900 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                'flex flex-col items-center rounded-xl px-3 py-2 transition-colors',
                tab === t.key
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400',
              )}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-[11px] text-slate-500">
                {formatWeekOf(t.week)}
              </span>
            </button>
          ))}
        </div>

        {view.status === 'loading' ? (
          <Spinner />
        ) : view.status === 'menu' ? (
          <WeekMenu menuId={view.menuId} mode={tab === 'next' ? 'order' : 'rate'} />
        ) : view.status === 'snapshot' ? (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-100">
                {formatWeekOf(weekOf)}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Clean Eatz menu · {view.meals.length} meals
              </p>
            </div>
            <Button onClick={adopt} disabled={busy} full size="lg">
              {busy ? 'Adding…' : 'Use this menu'}
            </Button>
            <Card className="divide-y divide-slate-800 p-0">
              {view.meals.map((m) => (
                <Link
                  key={m.id}
                  to={`/meals/${m.id}`}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  {m.image_url ? (
                    <img
                      src={m.image_url}
                      alt=""
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      className="h-9 w-9 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-800" />
                  )}
                  <span className="truncate text-sm text-slate-200">
                    {m.name}
                  </span>
                </Link>
              ))}
            </Card>
            <button
              onClick={build}
              disabled={busy}
              className="self-center text-sm font-medium text-slate-500 hover:text-slate-300"
            >
              Start from scratch instead
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-slate-100">
              {formatWeekOf(weekOf)}
            </h1>
            <EmptyState
              icon="🍽️"
              title={
                tab === 'next' ? 'Next week’s menu isn’t up yet' : 'No menu this week'
              }
              action={
                <Button onClick={build} disabled={busy}>
                  {busy ? 'Creating…' : 'Build it'}
                </Button>
              }
            >
              {tab === 'next'
                ? 'The Clean Eatz menu usually posts Tuesday morning. Check back, or build one now.'
                : `${activeHousehold?.name} hasn’t set up a menu for this week.`}
            </EmptyState>
          </div>
        )}
      </div>

      {tab === 'this' ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-10 mx-auto flex max-w-md justify-center bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pb-2 pt-8"
          style={{ bottom: 'calc(58px + env(safe-area-inset-bottom))' }}
        >
          <Link
            to="/menus"
            className="pointer-events-auto text-sm text-slate-500 hover:text-slate-300"
          >
            Previous weeks →
          </Link>
        </div>
      ) : null}
    </>
  )
}
