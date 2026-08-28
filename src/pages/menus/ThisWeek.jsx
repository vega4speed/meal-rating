import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { mondayOf, formatWeekOf } from '../../lib/week.js'
import WeekMenu from './WeekMenu.jsx'

export default function ThisWeek() {
  const nav = useNavigate()
  const { activeId, activeHousehold, loading: hhLoading } = useHousehold()
  const weekOf = mondayOf()
  const [menuId, setMenuId] = useState(undefined) // undefined = loading, null = none
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

  if (hhLoading || menuId === undefined) {
    return <p className="py-8 text-sm text-slate-500">Loading…</p>
  }

  if (!activeId) {
    return (
      <div className="flex flex-col gap-4 py-8">
        <h1 className="text-xl font-semibold text-slate-100">This Week</h1>
        <p className="text-sm text-slate-400">
          Join or create a household to start tracking weekly menus.
        </p>
        <Link
          to="/household"
          className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-semibold text-slate-950"
        >
          Go to Household
        </Link>
      </div>
    )
  }

  if (!menuId) {
    return (
      <div className="flex flex-col gap-4 py-8">
        <h1 className="text-xl font-semibold text-slate-100">
          {formatWeekOf(weekOf)}
        </h1>
        <p className="text-sm text-slate-400">
          No menu for {activeHousehold?.name} this week yet.
        </p>
        <button
          onClick={build}
          disabled={busy}
          className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-semibold text-slate-950 disabled:opacity-40"
        >
          {busy ? 'Creating…' : "Build this week's menu"}
        </button>
        <Link to="/menus" className="text-sm font-medium text-emerald-400">
          Past weeks →
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <WeekMenu menuId={menuId} />
      <Link to="/menus" className="text-sm font-medium text-emerald-400">
        Past weeks →
      </Link>
    </div>
  )
}
