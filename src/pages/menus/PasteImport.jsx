import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { normalizeMealName } from '../../lib/catalog.js'

const MATCH_THRESHOLD = 0.55

export default function PasteImport({ menuId, userId, onDone }) {
  const [text, setText] = useState('')
  const [lines, setLines] = useState(null) // null | [{idx, line, candidates, action, mealId}]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  async function match() {
    const raw = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!raw.length) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('match_menu_paste', {
      p_lines: raw,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    const byIdx = {}
    for (const row of data ?? []) {
      ;(byIdx[row.idx] ||= { idx: row.idx, line: row.line, candidates: [] })
      if (row.meal_id)
        byIdx[row.idx].candidates.push({
          mealId: row.meal_id,
          name: row.meal_name,
          score: row.score,
        })
    }
    const prepared = Object.values(byIdx)
      .sort((a, b) => a.idx - b.idx)
      .map((l) => {
        const best = l.candidates[0]
        const isMatch = best && best.score >= MATCH_THRESHOLD
        return {
          ...l,
          action: isMatch ? 'match' : 'new',
          mealId: isMatch ? best.mealId : null,
        }
      })
    setLines(prepared)
  }

  function setLine(idx, patch) {
    setLines((cur) =>
      cur.map((l) => (l.idx === idx ? { ...l, ...patch } : l)),
    )
  }

  async function resolveNewMeal(name) {
    const { data: prov } = await supabase
      .from('providers')
      .select('id')
      .order('name')
      .limit(1)
      .maybeSingle()
    const providerId = prov?.id
    const ins = await supabase
      .from('meals')
      .insert({ provider_id: providerId, name, created_by: userId })
      .select('id')
      .single()
    if (!ins.error) return ins.data.id
    if (ins.error.code === '23505') {
      const { data } = await supabase
        .from('meals')
        .select('id')
        .eq('provider_id', providerId)
        .eq('normalized_name', normalizeMealName(name))
        .maybeSingle()
      return data?.id ?? null
    }
    throw ins.error
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const mealIds = []
      for (const l of lines) {
        if (l.action === 'skip') continue
        if (l.action === 'match' && l.mealId) mealIds.push(l.mealId)
        else if (l.action === 'new') {
          const id = await resolveNewMeal(l.line)
          if (id) mealIds.push(id)
        }
      }
      if (mealIds.length) {
        const { error } = await supabase.rpc('add_menu_items', {
          p_menu_id: menuId,
          p_meal_ids: mealIds,
        })
        if (error) throw error
      }
      setDone(`Added ${mealIds.length} meal${mealIds.length === 1 ? '' : 's'}.`)
      setLines(null)
      setText('')
      await onDone?.()
    } catch (e) {
      setError(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-slate-400">Bulk paste</h2>

      {!lines ? (
        <>
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the week's meals, one per line"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
          <button
            onClick={match}
            disabled={busy || !text.trim()}
            className="self-start rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40"
          >
            {busy ? 'Matching…' : 'Match against catalog'}
          </button>
          {done ? <p className="text-sm text-emerald-400">{done}</p> : null}
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {lines.map((l) => (
              <li key={l.idx} className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">{l.line}</span>
                <select
                  value={
                    l.action === 'match'
                      ? `match:${l.mealId}`
                      : l.action === 'new'
                        ? 'new'
                        : 'skip'
                  }
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'new') setLine(l.idx, { action: 'new', mealId: null })
                    else if (v === 'skip')
                      setLine(l.idx, { action: 'skip', mealId: null })
                    else
                      setLine(l.idx, {
                        action: 'match',
                        mealId: v.slice('match:'.length),
                      })
                  }}
                  className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                >
                  {l.candidates.map((c) => (
                    <option key={c.mealId} value={`match:${c.mealId}`}>
                      {c.name} ({c.score.toFixed(2)})
                    </option>
                  ))}
                  <option value="new">➕ Create “{l.line}”</option>
                  <option value="skip">Skip</option>
                </select>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={busy}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
            >
              {busy ? 'Adding…' : 'Add to menu'}
            </button>
            <button
              onClick={() => setLines(null)}
              className="px-3 text-sm font-medium text-slate-400"
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </section>
  )
}
