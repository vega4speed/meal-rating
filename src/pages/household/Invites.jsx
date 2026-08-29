import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useHousehold } from '../../lib/household.jsx'
import BackLink from '../../components/BackLink.jsx'
import { Button, SectionHeading } from '../../components/ui.jsx'

export default function Invites() {
  const { user } = useAuth()
  const { activeId, refresh: refreshHouseholds } = useHousehold()
  const [received, setReceived] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const rx = await supabase
      .from('household_invites')
      .select(
        'id, created_at, households(name), inviter:profiles!household_invites_inviter_id_fkey(display_name, handle)',
      )
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setReceived(rx.data ?? [])

    if (activeId) {
      const tx = await supabase
        .from('household_invites')
        .select(
          'id, created_at, invitee:profiles!household_invites_invitee_id_fkey(display_name, handle)',
        )
        .eq('household_id', activeId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      setOutgoing(tx.data ?? [])
    } else {
      setOutgoing([])
    }
  }, [user.id, activeId])

  useEffect(() => {
    load()
  }, [load])

  async function respond(id, action) {
    setBusyId(id)
    setError(null)
    let err
    if (action === 'accept') {
      ;({ error: err } = await supabase.rpc('accept_invite', { p_invite_id: id }))
    } else if (action === 'decline') {
      ;({ error: err } = await supabase
        .from('household_invites')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', id))
    } else {
      ;({ error: err } = await supabase
        .from('household_invites')
        .update({ status: 'canceled', responded_at: new Date().toISOString() })
        .eq('id', id))
    }
    setBusyId(null)
    if (err) {
      setError(err.message)
      return
    }
    await load()
    if (action === 'accept') await refreshHouseholds()
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      <BackLink to="/household" />
      <h1 className="text-xl font-semibold text-slate-100">Invites</h1>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="flex flex-col gap-2">
        <SectionHeading>Received</SectionHeading>
        {received.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing pending.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-800">
            {received.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 py-3">
                <div className="text-slate-100">
                  {inv.households?.name}
                </div>
                <div className="text-xs text-slate-500">
                  from {inv.inviter?.display_name} (@{inv.inviter?.handle})
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === inv.id}
                    onClick={() => respond(inv.id, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === inv.id}
                    onClick={() => respond(inv.id, 'decline')}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Sent</SectionHeading>
        {outgoing.length === 0 ? (
          <p className="text-sm text-slate-500">None outstanding.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-800">
            {outgoing.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="text-slate-100">
                    {inv.invitee?.display_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    @{inv.invitee?.handle}
                  </div>
                </div>
                <button
                  disabled={busyId === inv.id}
                  onClick={() => respond(inv.id, 'cancel')}
                  className="text-sm font-medium text-slate-400 disabled:opacity-40"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
