import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'

function EmptyState() {
  return (
    <div className="flex flex-col gap-4 py-8">
      <h1 className="text-xl font-semibold text-slate-100">Household</h1>
      <p className="text-sm text-slate-400">
        You’re not in a household yet. Create one, or join with a code.
      </p>
      <div className="flex flex-col gap-3">
        <Link
          to="/household/create"
          className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-semibold text-slate-950"
        >
          Create a household
        </Link>
        <Link
          to="/household/join"
          className="rounded-xl bg-slate-800 px-4 py-3 text-center font-semibold text-slate-200"
        >
          Join by code
        </Link>
      </div>
    </div>
  )
}

export default function HouseholdHome() {
  const { user } = useAuth()
  const {
    loading,
    memberships,
    activeId,
    activeHousehold,
    activeRole,
    setActive,
    refresh,
  } = useHousehold()

  const [members, setMembers] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [code, setCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCode(activeHousehold?.join_code ?? null)
  }, [activeHousehold?.join_code])

  const loadMembers = useCallback(async () => {
    if (!activeId) {
      setMembers([])
      return
    }
    const { data } = await supabase
      .from('household_members')
      .select('role, joined_at, user_id, profiles(handle, display_name)')
      .eq('household_id', activeId)
      .order('joined_at', { ascending: true })
    setMembers(data ?? [])
  }, [activeId])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  useEffect(() => {
    supabase
      .from('household_invites')
      .select('id', { count: 'exact', head: true })
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [user.id])

  async function rotate() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('rotate_join_code', {
      p_household_id: activeId,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setCode(data)
      refresh()
    }
  }

  async function removeMember(userId) {
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', activeId)
      .eq('user_id', userId)
    setBusy(false)
    if (error) setError(error.message)
    else {
      await loadMembers()
      if (userId === user.id) await refresh()
    }
  }

  if (loading) {
    return <p className="py-8 text-sm text-slate-500">Loading…</p>
  }

  if (memberships.length === 0) return <EmptyState />

  const isOwner = activeRole === 'owner'

  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">
          {activeHousehold?.name}
        </h1>
        <Link to="/household/invites" className="text-sm text-emerald-400">
          Invites{pendingCount ? ` (${pendingCount})` : ''}
        </Link>
      </div>

      {memberships.length > 1 ? (
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">
            Active household
          </span>
          <select
            value={activeId}
            onChange={(e) => setActive(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-100"
          >
            {memberships.map((m) => (
              <option key={m.household_id} value={m.household_id}>
                {m.households?.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">Members</h2>
        <ul className="flex flex-col divide-y divide-slate-800">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <div className="text-slate-100">
                  {m.profiles?.display_name}
                  {m.user_id === user.id ? (
                    <span className="text-slate-500"> (you)</span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">
                  @{m.profiles?.handle} · {m.role}
                </div>
              </div>
              {isOwner && m.user_id !== user.id ? (
                <button
                  disabled={busy}
                  onClick={() => removeMember(m.user_id)}
                  className="text-sm font-medium text-rose-400 disabled:opacity-40"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-400">Join code</h2>
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <span className="font-mono text-lg tracking-widest text-slate-100">
            {code}
          </span>
          {isOwner ? (
            <button
              disabled={busy}
              onClick={rotate}
              className="text-sm font-medium text-emerald-400 disabled:opacity-40"
            >
              Rotate
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">
          Share this code so someone can join without an invite.
        </p>
      </section>

      <div className="flex flex-col gap-3 pt-2">
        <Link
          to="/household/find"
          className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-semibold text-slate-950"
        >
          Find people to invite
        </Link>
        <div className="flex gap-3">
          <Link
            to="/household/create"
            className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-center text-sm font-semibold text-slate-200"
          >
            New household
          </Link>
          <Link
            to="/household/join"
            className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-center text-sm font-semibold text-slate-200"
          >
            Join by code
          </Link>
        </div>
        <button
          disabled={busy}
          onClick={() => removeMember(user.id)}
          className="py-2 text-sm font-medium text-rose-400 disabled:opacity-40"
        >
          Leave {activeHousehold?.name}
        </button>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </div>
  )
}
