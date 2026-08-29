import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { mondayOf, formatWeekOf } from '../../lib/week.js'
import BackLink from '../../components/BackLink.jsx'
import { Button, Card, Pill, Spinner } from '../../components/ui.jsx'

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
    <div className="flex flex-col gap-4">
      <BackLink to="/">This week</BackLink>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Menus</h1>
        <Button size="sm" onClick={buildThisWeek} disabled={busy || !activeId}>
          Build this week
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : menus.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No menus yet.</p>
      ) : (
        <Card className="divide-y divide-slate-800 p-0">
          {menus.map((m) => (
            <Link
              key={m.id}
              to={`/menus/${m.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="text-slate-100">{formatWeekOf(m.week_of)}</span>
              <Pill tone={m.status === 'published' ? 'emerald' : 'amber'}>
                {m.status}
              </Pill>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
