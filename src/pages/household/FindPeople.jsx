import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'
import { Field, Input } from '../../components/ui.jsx'
import BackLink from '../../components/BackLink.jsx'

export default function FindPeople() {
  const { user } = useAuth()
  const { activeId, activeHousehold } = useHousehold()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sent, setSent] = useState({}) // profileId -> 'sent' | error string
  const debounce = useRef(null)

  useEffect(() => {
    clearTimeout(debounce.current)
    const term = q.trim().toLowerCase()
    if (term.length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    debounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, handle, display_name')
        .ilike('handle', `${term}%`)
        .neq('id', user.id)
        .limit(10)
      setSearching(false)
      setResults(data ?? [])
    }, 300)
    return () => clearTimeout(debounce.current)
  }, [q, user.id])

  async function invite(profileId) {
    setSent((s) => ({ ...s, [profileId]: 'sending' }))
    const { error } = await supabase.from('household_invites').insert({
      household_id: activeId,
      inviter_id: user.id,
      invitee_id: profileId,
      status: 'pending',
    })
    setSent((s) => ({
      ...s,
      [profileId]: error
        ? error.code === '23505'
          ? 'Already invited'
          : error.message
        : 'sent',
    }))
  }

  if (!activeId) {
    return (
      <div className="flex flex-col gap-4 py-2">
        <BackLink to="/household" />
        <p className="text-sm text-slate-400">
          Create or join a household first.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      <BackLink to="/household" />
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Find people</h1>
        <p className="text-sm text-slate-400">
          Invite someone to {activeHousehold?.name}.
        </p>
      </div>

      <Field label="Search by handle">
        <Input
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="chip"
        />
      </Field>

      {searching ? (
        <p className="text-sm text-slate-500">Searching…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800">
          {results.map((p) => {
            const state = sent[p.id]
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="text-slate-100">{p.display_name}</div>
                  <div className="text-xs text-slate-500">@{p.handle}</div>
                </div>
                {state === 'sent' ? (
                  <span className="text-sm text-emerald-400">Invited</span>
                ) : state && state !== 'sending' ? (
                  <span className="text-sm text-slate-400">{state}</span>
                ) : (
                  <button
                    disabled={state === 'sending'}
                    onClick={() => invite(p.id)}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                  >
                    Invite
                  </button>
                )}
              </li>
            )
          })}
          {q.trim().length >= 2 && !searching && results.length === 0 ? (
            <li className="py-3 text-sm text-slate-500">No matches.</li>
          ) : null}
        </ul>
      )}
    </div>
  )
}
