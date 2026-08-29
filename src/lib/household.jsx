import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import { supabase } from './supabase.js'
import { useAuth } from './auth.jsx'

const HouseholdContext = createContext(null)
const ACTIVE_KEY = 'meal-rating.activeHousehold'

function readActive() {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function HouseholdProvider({ children }) {
  const { user } = useAuth()
  const [memberships, setMemberships] = useState([])
  const [activeId, setActiveId] = useState(readActive())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('household_members')
      .select('role, household_id, households(id, name, join_code, created_by)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
    const rows = data ?? []
    setMemberships(rows)
    setLoading(false)

    // Keep the active household pointing at something real.
    setActiveId((current) => {
      const stillValid = rows.some((r) => r.household_id === current)
      const next = stillValid ? current : (rows[0]?.household_id ?? null)
      try {
        if (next) localStorage.setItem(ACTIVE_KEY, next)
        else localStorage.removeItem(ACTIVE_KEY)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [user])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const setActive = useCallback((id) => {
    setActiveId(id)
    try {
      localStorage.setItem(ACTIVE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  // Fallback consumer for a /join/<code> link that the router didn't preserve
  // through sign-in. JoinLink handles the common path; this catches the rest.
  useEffect(() => {
    if (!user || loading) return
    let code
    try {
      code = localStorage.getItem('meal-rating.pendingJoinCode')
    } catch {
      code = null
    }
    if (!code) return
    ;(async () => {
      const { data } = await supabase.rpc('join_household_by_code', {
        p_code: code,
      })
      try {
        localStorage.removeItem('meal-rating.pendingJoinCode')
      } catch {
        /* ignore */
      }
      await refresh()
      if (data?.id) setActive(data.id)
    })()
  }, [user, loading, refresh, setActive])

  const active = memberships.find((m) => m.household_id === activeId) ?? null

  return (
    <HouseholdContext.Provider
      value={{
        loading,
        memberships,
        activeId,
        activeHousehold: active?.households ?? null,
        activeRole: active?.role ?? null,
        setActive,
        refresh,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  )
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider')
  return ctx
}
