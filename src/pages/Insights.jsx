import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { useHousehold } from '../lib/household.jsx'
import { relativeWeek, monthsSince } from '../lib/badges.js'

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export default function Insights() {
  const { user } = useAuth()
  const { activeId, activeHousehold } = useHousehold()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [stats, last, meals, ratings, members, sels] = await Promise.all([
      supabase
        .from('v_meal_household_stats')
        .select('meal_id, avg_score, rating_count, rater_count')
        .eq('household_id', activeId),
      supabase
        .from('v_meal_household_last_had')
        .select('meal_id, last_week')
        .eq('household_id', activeId),
      supabase.from('meals').select('id, name'),
      supabase
        .from('ratings')
        .select('user_id, score, meal_variations(meal_id)'),
      supabase
        .from('household_members')
        .select('user_id, profiles(display_name)')
        .eq('household_id', activeId),
      supabase.from('menu_selections').select('user_id'),
    ])
    setData({
      stats: stats.data ?? [],
      last: Object.fromEntries(
        (last.data ?? []).map((r) => [r.meal_id, r.last_week]),
      ),
      mealName: Object.fromEntries(
        (meals.data ?? []).map((m) => [m.id, m.name]),
      ),
      ratings: ratings.data ?? [],
      members: members.data ?? [],
      sels: sels.data ?? [],
    })
    setLoading(false)
  }, [activeId])

  useEffect(() => {
    load()
  }, [load])

  const memberIds = useMemo(
    () => new Set((data?.members ?? []).map((m) => m.user_id)),
    [data],
  )
  const nameOf = useMemo(
    () =>
      Object.fromEntries(
        (data?.members ?? []).map((m) => [m.user_id, m.profiles?.display_name]),
      ),
    [data],
  )

  // meal_id -> user_id -> mean score (household members only)
  const mealUserScore = useMemo(() => {
    const acc = {}
    for (const r of data?.ratings ?? []) {
      const mid = r.meal_variations?.meal_id
      if (!mid || !memberIds.has(r.user_id)) continue
      ;((acc[mid] ||= {})[r.user_id] ||= []).push(r.score)
    }
    for (const mid of Object.keys(acc))
      for (const uid of Object.keys(acc[mid]))
        acc[mid][uid] = mean(acc[mid][uid])
    return acc
  }, [data, memberIds])

  if (loading) return <p className="py-8 text-sm text-slate-500">Loading…</p>
  if (!activeId) {
    return (
      <div className="flex flex-col gap-4 py-8">
        <h1 className="text-xl font-semibold text-slate-100">Insights</h1>
        <p className="text-sm text-slate-400">
          Join or create a household first.
        </p>
        <Link to="/household" className="text-sm font-medium text-emerald-400">
          Go to Household →
        </Link>
      </div>
    )
  }

  const reorder = [...data.stats]
    .filter((s) => s.rating_count > 0 && s.avg_score >= 4)
    .map((s) => ({ ...s, last: data.last[s.meal_id] ?? null }))
    .sort((a, b) => {
      const am = a.last ? monthsSince(a.last) : 999
      const bm = b.last ? monthsSince(b.last) : 999
      return bm - am || b.avg_score - a.avg_score
    })
    .slice(0, 15)

  const disagreements = Object.entries(mealUserScore)
    .map(([mid, byUser]) => {
      const mineScore = byUser[user.id]
      if (mineScore == null) return null
      let worst = null
      for (const [uid, sc] of Object.entries(byUser)) {
        if (uid === user.id) continue
        const gap = Math.abs(sc - mineScore)
        if (!worst || gap > worst.gap) worst = { uid, sc, gap }
      }
      if (!worst || worst.gap < 1) return null
      return { mid, mineScore, ...worst }
    })
    .filter(Boolean)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 10)

  const selCount = {}
  for (const s of data.sels) selCount[s.user_id] = (selCount[s.user_id] ?? 0) + 1
  const perPerson = data.members.map((m) => {
    const rs = (data.ratings ?? []).filter((r) => r.user_id === m.user_id)
    const meals = new Set(
      rs.map((r) => r.meal_variations?.meal_id).filter(Boolean),
    )
    return {
      uid: m.user_id,
      name: m.profiles?.display_name,
      rated: meals.size,
      avg: mean(rs.map((r) => r.score)),
      picks: selCount[m.user_id] ?? 0,
    }
  })

  return (
    <div className="flex flex-col gap-8 py-2">
      <h1 className="text-xl font-semibold text-slate-100">
        {activeHousehold?.name} · Insights
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">Reorder list</h2>
        <p className="text-xs text-slate-500">
          Liked meals (household ★ 4+), stalest first.
        </p>
        {reorder.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing rated 4+ yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-800">
            {reorder.map((s) => (
              <li key={s.meal_id}>
                <Link
                  to={`/meals/${s.meal_id}`}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-slate-100">
                    {data.mealName[s.meal_id]}
                  </span>
                  <span className="text-right text-xs">
                    <span className="text-amber-400">★ {s.avg_score}</span>
                    <span className="block text-slate-500">
                      {relativeWeek(s.last)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">
          Where you disagree
        </h2>
        {disagreements.length === 0 ? (
          <p className="text-sm text-slate-500">
            No big gaps yet — need two people rating the same meals.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-800">
            {disagreements.map((d) => (
              <li
                key={d.mid}
                className="flex items-center justify-between py-2.5"
              >
                <Link
                  to={`/meals/${d.mid}`}
                  className="text-slate-100"
                >
                  {data.mealName[d.mid]}
                </Link>
                <span className="text-xs text-slate-400">
                  you {d.mineScore.toFixed(1)} · {nameOf[d.uid]}{' '}
                  {d.sc.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">Per person</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 pr-3 font-medium">Person</th>
                <th className="py-1 pr-3 font-medium">Rated</th>
                <th className="py-1 pr-3 font-medium">Avg</th>
                <th className="py-1 font-medium">Picks</th>
              </tr>
            </thead>
            <tbody>
              {perPerson.map((p) => (
                <tr key={p.uid} className="border-t border-slate-800">
                  <td className="py-2 pr-3 text-slate-100">{p.name}</td>
                  <td className="py-2 pr-3 text-slate-300">{p.rated}</td>
                  <td className="py-2 pr-3 text-slate-300">
                    {p.avg != null ? p.avg.toFixed(1) : '—'}
                  </td>
                  <td className="py-2 text-slate-300">{p.picks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
