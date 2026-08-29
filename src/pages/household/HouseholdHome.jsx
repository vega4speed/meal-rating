import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'
import {
  Button,
  Card,
  Pill,
  Select,
  SectionHeading,
  Spinner,
  EmptyState,
  ErrorText,
} from '../../components/ui.jsx'

function EmptyHousehold() {
  return (
    <EmptyState icon="🏠" title="You’re not in a household">
      <span className="mb-4 block">
        Create one for your place, or join an existing one with its code.
      </span>
      <div className="flex flex-col gap-3">
        <Link to="/household/create">
          <Button full>Create a household</Button>
        </Link>
        <Link to="/household/join">
          <Button full variant="secondary">
            Join by code
          </Button>
        </Link>
      </div>
    </EmptyState>
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
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCode(activeHousehold?.join_code ?? null)
  }, [activeHousehold?.join_code])

  const loadMembers = useCallback(async () => {
    if (!activeId) return setMembers([])
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

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
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

  if (loading) return <Spinner />
  if (memberships.length === 0) return <EmptyHousehold />

  const isOwner = activeRole === 'owner'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">
          {activeHousehold?.name}
        </h1>
        <Link
          to="/household/invites"
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200"
        >
          Invites
          {pendingCount ? (
            <span className="rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-slate-950">
              {pendingCount}
            </span>
          ) : null}
        </Link>
      </div>

      {memberships.length > 1 ? (
        <Select value={activeId} onChange={(e) => setActive(e.target.value)}>
          {memberships.map((m) => (
            <option key={m.household_id} value={m.household_id}>
              {m.households?.name}
            </option>
          ))}
        </Select>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Members</SectionHeading>
        <Card className="divide-y divide-slate-800 p-0">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-slate-100">
                  {m.profiles?.display_name}
                  {m.user_id === user.id ? (
                    <span className="text-slate-500"> · you</span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">@{m.profiles?.handle}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.role === 'owner' ? <Pill tone="emerald">owner</Pill> : null}
                {isOwner && m.user_id !== user.id ? (
                  <button
                    disabled={busy}
                    onClick={() => removeMember(m.user_id)}
                    className="text-sm font-medium text-slate-500 hover:text-rose-400 disabled:opacity-40"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Join code</SectionHeading>
        <Card className="flex items-center justify-between gap-3">
          <button
            onClick={copyCode}
            className="font-mono text-xl tracking-[0.3em] text-slate-100"
          >
            {code}
          </button>
          <div className="flex items-center gap-3 text-sm font-medium">
            <span className="text-emerald-400">{copied ? 'Copied' : null}</span>
            <button onClick={copyCode} className="text-slate-400">
              Copy
            </button>
            {isOwner ? (
              <button
                disabled={busy}
                onClick={rotate}
                className="text-emerald-400 disabled:opacity-40"
              >
                Rotate
              </button>
            ) : null}
          </div>
        </Card>
        <p className="text-xs text-slate-500">
          Anyone with this code can join the household.
        </p>
      </section>

      <div className="flex flex-col gap-3">
        <Link to="/household/find">
          <Button full>Find people to invite</Button>
        </Link>
        <div className="flex gap-3">
          <Link to="/household/create" className="flex-1">
            <Button full variant="secondary" size="sm">
              New household
            </Button>
          </Link>
          <Link to="/household/join" className="flex-1">
            <Button full variant="secondary" size="sm">
              Join by code
            </Button>
          </Link>
        </div>
        <button
          disabled={busy}
          onClick={() => removeMember(user.id)}
          className="py-2 text-sm font-medium text-slate-500 hover:text-rose-400 disabled:opacity-40"
        >
          Leave {activeHousehold?.name}
        </button>
      </div>

      <ErrorText>{error}</ErrorText>
    </div>
  )
}
