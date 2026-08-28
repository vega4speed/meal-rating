import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { macroLine } from '../../lib/catalog.js'
import StarRating from '../../components/StarRating.jsx'

function pct(x) {
  return x == null ? null : `${Math.round(x * 100)}%`
}

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
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-slate-100">{variation.label}</span>
        {macros ? (
          <span className="text-right text-xs text-slate-500">{macros}</span>
        ) : null}
      </div>

      {householdStat ? (
        <div className="text-xs text-slate-400">
          Household {householdStat.avg_score} · {householdStat.rating_count}{' '}
          rating{householdStat.rating_count === 1 ? '' : 's'}
          {householdStat.reorder_rate != null
            ? ` · ${pct(householdStat.reorder_rate)} would reorder`
            : ''}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-slate-500">Your rating</span>
        <StarRating value={score} onRate={rate} />
      </div>

      {score != null ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toggleReorder(true)}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                reorder === true
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300',
              ].join(' ')}
            >
              Would reorder
            </button>
            <button
              type="button"
              onClick={() => toggleReorder(false)}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                reorder === false
                  ? 'bg-rose-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300',
              ].join(' ')}
            >
              Wouldn’t
            </button>
          </div>

          <input
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((notes.trim() || null) !== (myRating?.notes ?? null))
                save({ score, reorder, notes })
            }}
            placeholder="Note (optional)"
            className="min-h-[40px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />

          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="self-start text-xs font-medium text-rose-400 disabled:opacity-40"
          >
            Delete my rating
          </button>
        </>
      ) : null}

      {others.length ? (
        <ul className="flex flex-col gap-1 border-t border-slate-800 pt-2 text-xs text-slate-400">
          {others.map((b) => (
            <li key={b.user_id}>
              {b.profiles?.display_name}: {'★'.repeat(b.score)}
              {b.would_reorder === true
                ? ' · would reorder'
                : b.would_reorder === false
                  ? ' · wouldn’t'
                  : ''}
              {b.notes ? ` — ${b.notes}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  )
}
