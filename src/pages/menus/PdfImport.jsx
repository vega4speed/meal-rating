import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'

const MATCH_THRESHOLD = 0.55

export default function PdfImport({ menuId, onDone }) {
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState(null) // [{meal, candidates, action, mealId}]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setParsing(true)
    setError(null)
    setDone(null)
    try {
      const { parsePdfMenu } = await import('../../lib/menuPdf.js')
      const { meals } = await parsePdfMenu(file)
      if (!meals.length) {
        setError(
          'No meals found. Is this the Clean Eatz weekly macro matrix? Try Bulk paste instead.',
        )
        setParsing(false)
        return
      }
      const { data, error } = await supabase.rpc('match_menu_paste', {
        p_lines: meals.map((m) => m.name),
      })
      if (error) throw error
      const byIdx = {}
      for (const r of data ?? []) {
        ;(byIdx[r.idx] ||= []).push({
          mealId: r.meal_id,
          name: r.meal_name,
          score: r.score,
        })
      }
      setRows(
        meals.map((meal, i) => {
          const candidates = byIdx[i + 1] ?? []
          const best = candidates[0]
          const isMatch = best && best.score >= MATCH_THRESHOLD
          return {
            meal,
            candidates,
            action: isMatch ? 'match' : 'new',
            mealId: isMatch ? best.mealId : null,
          }
        }),
      )
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setParsing(false)
    }
  }

  function setRow(i, patch) {
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const mealIds = []
      for (const r of rows) {
        if (r.action === 'skip') continue
        if (r.action === 'match' && r.mealId) {
          mealIds.push(r.mealId)
        } else if (r.action === 'new') {
          const { data, error } = await supabase.rpc('upsert_catalog_meal', {
            p_name: r.meal.name,
            p_tags: r.meal.tags,
            p_description: r.meal.description,
            p_variations: r.meal.variations,
          })
          if (error) throw error
          if (data) mealIds.push(data)
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
      setRows(null)
      await onDone?.()
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-slate-400">Import from PDF</h2>

      {!rows ? (
        <>
          <label className="self-start rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">
            {parsing ? 'Reading…' : 'Choose PDF'}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={parsing}
              onChange={onFile}
            />
          </label>
          <p className="text-xs text-slate-500">
            Clean Eatz weekly macro matrix. Names, variations, and macros are read
            in the browser.
          </p>
          {done ? <p className="text-sm text-emerald-400">{done}</p> : null}
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-slate-200">{r.meal.name}</span>
                  <span className="text-xs text-slate-500">
                    {r.meal.variations.length} var ·{' '}
                    {r.meal.variations[0].cal} cal
                  </span>
                </div>
                <select
                  value={
                    r.action === 'match'
                      ? `match:${r.mealId}`
                      : r.action === 'new'
                        ? 'new'
                        : 'skip'
                  }
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'new') setRow(i, { action: 'new', mealId: null })
                    else if (v === 'skip')
                      setRow(i, { action: 'skip', mealId: null })
                    else
                      setRow(i, {
                        action: 'match',
                        mealId: v.slice('match:'.length),
                      })
                  }}
                  className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                >
                  {r.candidates.map((c) => (
                    <option key={c.mealId} value={`match:${c.mealId}`}>
                      {c.name} ({c.score.toFixed(2)})
                    </option>
                  ))}
                  <option value="new">➕ Create “{r.meal.name}” + macros</option>
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
              onClick={() => setRows(null)}
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
