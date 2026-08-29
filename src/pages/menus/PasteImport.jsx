import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { normalizeMealName } from '../../lib/catalog.js'
import { Button, Textarea, ErrorText } from '../../components/ui.jsx'

const MATCH_THRESHOLD = 0.55

export default function PasteImport({ menuId, onDone }) {
  const { user } = useAuth()
  const userId = user.id
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
    <div className="flex flex-col gap-3">
      {!lines ? (
        <>
          <Textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the week's meals, one per line"
          />
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={match}
            disabled={busy || !text.trim()}
          >
            {busy ? 'Matching…' : 'Match against catalog'}
          </Button>
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
                  className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
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
          <div className="flex items-center gap-3">
            <Button onClick={confirm} disabled={busy}>
              {busy ? 'Adding…' : 'Add to menu'}
            </Button>
            <button
              onClick={() => setLines(null)}
              className="text-sm font-medium text-slate-400"
            >
              Cancel
            </button>
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
