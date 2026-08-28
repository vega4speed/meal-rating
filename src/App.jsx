import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav.jsx'
import Placeholder from './pages/Placeholder.jsx'

export default function App() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <main
        className="flex-1 px-4 pt-6"
        style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <Routes>
          <Route path="/" element={<Placeholder title="This Week" />} />
          <Route path="/meals" element={<Placeholder title="Meals" />} />
          <Route path="/household" element={<Placeholder title="Household" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
