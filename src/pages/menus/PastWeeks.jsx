import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { mondayOf, formatWeekOf } from '../../lib/week.js'
import BackLink from '../../components/BackLink.jsx'

export default function PastWeeks() {
  const nav = useNavigate()
  const { activeId } = useHousehold()
  const [menus, setMenus] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!activeId) {
      setMenus([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('weekly_menus')
      .select('id, week_of, status')
      .eq('household_id', activeId)
      .order('week_of', { ascending: false })
    setMenus(data ?? [])
    setLoading(false)
  }, [activeId])

  useEffect(() => {
    load()
  }, [load])

  async function buildThisWeek() {
    setBusy(true)
    const { data, error } = await supabase.rpc('ensure_weekly_menu', {
      p_household_id: activeId,
      p_week_of: mondayOf(),
    })
    setBusy(false)
    if (!error && data?.id) nav(`/menus/${data.id}/edit`)
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <BackLink to="/" children="This week" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Menus</h1>
        <button
          onClick={buildThisWeek}
          disabled={busy || !activeId}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          Build this week
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : menus.length === 0 ? (
        <p className="text-sm text-slate-500">No menus yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800">
          {menus.map((m) => (
            <li key={m.id}>
              <Link
                to={`/menus/${m.id}`}
                className="flex items-center justify-between py-3"
              >
                <span className="text-slate-100">{formatWeekOf(m.week_of)}</span>
                <span
                  className={
                    m.status === 'published'
                      ? 'text-xs text-emerald-400'
                      : 'text-xs text-amber-400'
                  }
                >
                  {m.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
