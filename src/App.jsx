import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { HouseholdProvider } from './lib/household.jsx'
import BottomNav from './components/BottomNav.jsx'
import Placeholder from './pages/Placeholder.jsx'
import SignIn from './pages/SignIn.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Profile from './pages/Profile.jsx'
import HouseholdHome from './pages/household/HouseholdHome.jsx'
import CreateHousehold from './pages/household/CreateHousehold.jsx'
import JoinByCode from './pages/household/JoinByCode.jsx'
import FindPeople from './pages/household/FindPeople.jsx'
import Invites from './pages/household/Invites.jsx'

function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
      Loading…
    </div>
  )
}

function Shell() {
  const { profile } = useAuth()
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pt-4 text-sm">
        <span className="font-semibold text-slate-200">Meal Rating</span>
        <Link to="/profile" className="text-emerald-400">
          {profile?.display_name ?? 'Profile'}
        </Link>
      </header>
      <main
        className="flex-1 px-4 pt-4"
        style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <Routes>
          <Route path="/" element={<Placeholder title="This Week" />} />
          <Route path="/meals" element={<Placeholder title="Meals" />} />
          <Route path="/household" element={<HouseholdHome />} />
          <Route path="/household/create" element={<CreateHousehold />} />
          <Route path="/household/join" element={<JoinByCode />} />
          <Route path="/household/find" element={<FindPeople />} />
          <Route path="/household/invites" element={<Invites />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

function Gate() {
  const { loading, session, profile } = useAuth()

  if (loading) return <Loading />

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<SignIn />} />
      </Routes>
    )
  }

  if (!profile) {
    return (
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    )
  }

  return (
    <HouseholdProvider>
      <Shell />
    </HouseholdProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
