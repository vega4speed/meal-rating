import { useEffect } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { HouseholdProvider, useHousehold } from './lib/household.jsx'
import { Spinner } from './components/ui.jsx'
import BottomNav from './components/BottomNav.jsx'
import SignIn from './pages/SignIn.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Profile from './pages/Profile.jsx'
import Insights from './pages/Insights.jsx'
import ThisWeek from './pages/menus/ThisWeek.jsx'
import PastWeeks from './pages/menus/PastWeeks.jsx'
import MenuView from './pages/menus/MenuView.jsx'
import BuildMenu from './pages/menus/BuildMenu.jsx'
import MealList from './pages/meals/MealList.jsx'
import AddMeal from './pages/meals/AddMeal.jsx'
import MealDetail from './pages/meals/MealDetail.jsx'
import HouseholdHome from './pages/household/HouseholdHome.jsx'
import CreateHousehold from './pages/household/CreateHousehold.jsx'
import JoinByCode from './pages/household/JoinByCode.jsx'
import FindPeople from './pages/household/FindPeople.jsx'
import JoinLink, { PENDING_JOIN_KEY } from './pages/household/JoinLink.jsx'
import Invites from './pages/household/Invites.jsx'

function Header() {
  const { profile } = useAuth()
  const { activeHousehold } = useHousehold()
  return (
    <header
      className="sticky top-0 z-10 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">Meal Rating</div>
          {activeHousehold?.name ? (
            <div className="truncate text-xs text-slate-500">
              {activeHousehold.name}
            </div>
          ) : null}
        </div>
        <Link
          to="/profile"
          className="rounded-full bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200"
        >
          {profile?.display_name ?? 'Profile'}
        </Link>
      </div>
    </header>
  )
}

function Shell() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <Header />
      <main
        className="flex-1 px-4 pt-5"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
      >
        <Routes>
          <Route path="/" element={<ThisWeek />} />
          <Route path="/menus" element={<PastWeeks />} />
          <Route path="/menus/:menuId" element={<MenuView />} />
          <Route path="/menus/:menuId/edit" element={<BuildMenu />} />
          <Route path="/meals" element={<MealList />} />
          <Route path="/meals/new" element={<AddMeal />} />
          <Route path="/meals/:id" element={<MealDetail />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/household" element={<HouseholdHome />} />
          <Route path="/household/create" element={<CreateHousehold />} />
          <Route path="/household/join" element={<JoinByCode />} />
          <Route path="/household/find" element={<FindPeople />} />
          <Route path="/household/invites" element={<Invites />} />
          <Route path="/join/:code" element={<JoinLink />} />
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
  const loc = useLocation()

  // Remember a /join/<code> deep link so it survives sign-in + onboarding.
  useEffect(() => {
    const m = loc.pathname.match(/^\/join\/([A-Za-z0-9]+)/)
    if (m) {
      try {
        localStorage.setItem(PENDING_JOIN_KEY, m[1].toUpperCase())
      } catch {
        /* ignore */
      }
    }
  }, [loc.pathname])

  if (loading) return <Spinner />

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
