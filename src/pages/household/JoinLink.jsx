import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useHousehold } from '../../lib/household.jsx'
import { Button, Spinner } from '../../components/ui.jsx'

export const PENDING_JOIN_KEY = 'meal-rating.pendingJoinCode'

export default function JoinLink() {
  const { code } = useParams()
  const { refresh, setActive } = useHousehold()
  const [state, setState] = useState('joining') // joining | done | error
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    ;(async () => {
      const { data, error } = await supabase.rpc('join_household_by_code', {
        p_code: code,
      })
      try {
        localStorage.removeItem(PENDING_JOIN_KEY)
      } catch {
        /* ignore */
      }
      if (error) {
        setMsg(
          error.message.toLowerCase().includes('invalid')
            ? 'That join link is no longer valid — ask for a new one.'
            : error.message,
        )
        setState('error')
        return
      }
      await refresh()
      if (data?.id) setActive(data.id)
      setName(data?.name ?? 'your household')
      setState('done')
    })()
  }, [code, refresh, setActive])

  if (state === 'joining') return <Spinner label="Joining…" />

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-4xl">{state === 'done' ? '🎉' : '😕'}</div>
      <p className="text-lg font-semibold text-slate-100">
        {state === 'done' ? `You’re in ${name}` : 'Couldn’t join'}
      </p>
      {state === 'error' ? (
        <p className="max-w-xs text-sm text-slate-400">{msg}</p>
      ) : null}
      <Link to={state === 'done' ? '/' : '/household'}>
        <Button>{state === 'done' ? 'This week’s menu' : 'Go to Household'}</Button>
      </Link>
    </div>
  )
}
