import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { mondayOf, formatWeekOf } from '../../lib/week.js'
import { Button, EmptyState, Spinner } from '../../components/ui.jsx'
import WeekMenu from './WeekMenu.jsx'

export default function ThisWeek() {
  const nav = useNavigate()
  const { activeId, activeHousehold, loading: hhLoading } = useHousehold()
  const weekOf = mondayOf()
  const [menuId, setMenuId] = useState(undefined)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!activeId) {
      setMenuId(null)
      return
    }
    const { data } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('household_id', activeId)
      .eq('week_of', weekOf)
      .maybeSingle()
    setMenuId(data?.id ?? null)
  }, [activeId, weekOf])

  useEffect(() => {
    load()
  }, [load])

  async function build() {
    setBusy(true)
    const { data, error } = await supabase.rpc('ensure_weekly_menu', {
      p_household_id: activeId,
      p_week_of: weekOf,
    })
    setBusy(false)
    if (!error && data?.id) nav(`/menus/${data.id}/edit`)
  }

  if (hhLoading || menuId === undefined) return <Spinner />

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

  if (!menuId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-slate-100">
          {formatWeekOf(weekOf)}
        </h1>
        <EmptyState
          icon="🍽️"
          title="No menu this week"
          action={
            <Button onClick={build} disabled={busy}>
              {busy ? 'Creating…' : "Build this week's menu"}
            </Button>
          }
        >
          {activeHousehold?.name} hasn’t set up a menu for this week.
        </EmptyState>
        <Link
          to="/menus"
          className="text-center text-sm font-medium text-emerald-400"
        >
          Past weeks →
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[75vh] flex-col gap-5">
      <WeekMenu menuId={menuId} />
      <Link
        to="/menus"
        className="mt-auto border-t border-slate-800 pt-4 text-center text-sm font-medium text-emerald-400"
      >
        Past weeks →
      </Link>
    </div>
  )
}
