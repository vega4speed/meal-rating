import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { useHousehold } from '../lib/household.jsx'
import { relativeWeek, monthsSince } from '../lib/badges.js'
import { Card, SectionHeading, Spinner, EmptyState } from '../components/ui.jsx'
import { Button } from '../components/ui.jsx'

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

  if (loading) return <Spinner />
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
        Insights compare ratings across your household.
      </EmptyState>
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
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-100">Insights</h1>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Reorder list</SectionHeading>
        <p className="text-xs text-slate-500">
          Meals the household rates ★ 4+, the ones you haven’t had in a while
          first.
        </p>
        {reorder.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing rated 4+ yet.</p>
        ) : (
          <Card className="divide-y divide-slate-800 p-0">
            {reorder.map((s) => (
              <Link
                key={s.meal_id}
                to={`/meals/${s.meal_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate text-slate-100">
                  {data.mealName[s.meal_id]}
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="font-medium text-amber-400">
                    ★ {Number(s.avg_score).toFixed(1)}
                  </span>
                  <span className="block text-slate-500">
                    {relativeWeek(s.last)}
                  </span>
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Where you disagree</SectionHeading>
        {disagreements.length === 0 ? (
          <p className="text-sm text-slate-500">
            No big gaps yet — needs two people rating the same meals.
          </p>
        ) : (
          <Card className="divide-y divide-slate-800 p-0">
            {disagreements.map((d) => (
              <Link
                key={d.mid}
                to={`/meals/${d.mid}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate text-slate-100">
                  {data.mealName[d.mid]}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  <span className="text-slate-200">you {d.mineScore.toFixed(1)}</span>
                  {' vs '}
                  {nameOf[d.uid]} {d.sc.toFixed(1)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Per person</SectionHeading>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">Person</th>
                <th className="py-2 pr-3 text-right font-semibold">Rated</th>
                <th className="py-2 pr-3 text-right font-semibold">Avg</th>
                <th className="py-2 pr-4 text-right font-semibold">Picks</th>
              </tr>
            </thead>
            <tbody>
              {perPerson.map((p) => (
                <tr key={p.uid} className="border-t border-slate-800">
                  <td className="px-4 py-2.5 text-slate-100">{p.name}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-300">
                    {p.rated}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-slate-300">
                    {p.avg != null ? p.avg.toFixed(1) : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-slate-300">
                    {p.picks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
