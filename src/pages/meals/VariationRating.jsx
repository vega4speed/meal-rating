import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { macroLine } from '../../lib/catalog.js'
import { Card, Textarea } from '../../components/ui.jsx'
import StarRating from '../../components/StarRating.jsx'

function pct(x) {
  return x == null ? null : `${Math.round(x * 100)}%`
}
const fmt1 = (x) => (x == null ? null : Number(x).toFixed(1))

export default function VariationRating({
  variation,
  userId,
  householdStat,
  myRating,
  breakdown,
  onChanged,
}) {
  const [score, setScore] = useState(myRating?.score ?? null)
  const [reorder, setReorder] = useState(myRating?.would_reorder ?? null)
  const [notes, setNotes] = useState(myRating?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setScore(myRating?.score ?? null)
    setReorder(myRating?.would_reorder ?? null)
    setNotes(myRating?.notes ?? '')
  }, [myRating?.score, myRating?.would_reorder, myRating?.notes])

  async function save(next) {
    setBusy(true)
    setError(null)
    const payload = {
      user_id: userId,
      variation_id: variation.id,
      score: next.score,
      would_reorder: next.reorder,
      notes: next.notes?.trim() || null,
    }
    const { error } = await supabase
      .from('ratings')
      .upsert(payload, { onConflict: 'user_id,variation_id' })
    setBusy(false)
    if (error) setError(error.message)
    else onChanged?.()
  }

  async function remove() {
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('ratings')
      .delete()
      .eq('user_id', userId)
      .eq('variation_id', variation.id)
    setBusy(false)
    if (error) setError(error.message)
    else {
      setScore(null)
      setReorder(null)
      setNotes('')
      onChanged?.()
    }
  }

  function rate(n) {
    setScore(n)
    save({ score: n, reorder, notes })
  }

  function toggleReorder(val) {
    const next = reorder === val ? null : val
    setReorder(next)
    save({ score, reorder: next, notes })
  }

  const macros = macroLine(variation)
  const others = breakdown.filter((b) => b.user_id !== userId)

  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-slate-100">{variation.label}</span>
        {macros ? (
          <span className="text-right text-xs text-slate-500">{macros}</span>
        ) : null}
      </div>

      {householdStat ? (
        <div className="text-xs text-slate-400">
          <span className="font-medium text-amber-400">
            ★ {fmt1(householdStat.avg_score)}
          </span>{' '}
          household · {householdStat.rating_count}{' '}
          rating{householdStat.rating_count === 1 ? '' : 's'}
          {householdStat.reorder_rate != null
            ? ` · ${pct(householdStat.reorder_rate)} reorder`
            : ''}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <StarRating value={score} onRate={rate} size="md" />
        {score != null ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-xs font-medium text-slate-500 hover:text-rose-400 disabled:opacity-40"
          >
            Clear
          </button>
        ) : (
          <span className="text-xs text-slate-600">tap to rate</span>
        )}
      </div>

      {score != null ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toggleReorder(true)}
              className={[
                'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                reorder === true
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
              ].join(' ')}
            >
              Would reorder
            </button>
            <button
              type="button"
              onClick={() => toggleReorder(false)}
              className={[
                'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                reorder === false
                  ? 'bg-rose-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
              ].join(' ')}
            >
              Wouldn’t
            </button>
          </div>

          <Textarea
            rows={2}
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((notes.trim() || null) !== (myRating?.notes ?? null))
                save({ score, reorder, notes })
            }}
            placeholder="Add a note (optional)"
          />
        </>
      ) : null}

      {others.length ? (
        <ul className="flex flex-col gap-1.5 border-t border-slate-800 pt-3 text-xs text-slate-400">
          {others.map((b) => (
            <li key={b.user_id} className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-slate-300">
                {b.profiles?.display_name}
              </span>
              <StarRating value={b.score} readOnly size="sm" />
              {b.would_reorder === true ? (
                <span className="text-emerald-400">would reorder</span>
              ) : b.would_reorder === false ? (
                <span className="text-rose-400">wouldn’t</span>
              ) : null}
              {b.notes ? (
                <span className="w-full text-slate-500">“{b.notes}”</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </Card>
  )
}
