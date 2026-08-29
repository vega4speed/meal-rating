import { NavLink } from 'react-router-dom'

const I = {
  week: (
    <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
  ),
  meals: (
    <>
      <path d="M3 11h18M12 11a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8Z" />
      <path d="M12 7V4" />
    </>
  ),
  insights: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  home: <path d="M3 11 12 3l9 8M5 10v10h14V10" />,
}

const tabs = [
  { to: '/', label: 'This Week', icon: 'week', end: true },
  { to: '/meals', label: 'Meals', icon: 'meals' },
  { to: '/insights', label: 'Insights', icon: 'insights' },
  { to: '/household', label: 'Household', icon: 'home' },
]

export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/90 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                [
                  'flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-emerald-400' : 'text-slate-500',
                ].join(' ')
              }
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {I[tab.icon]}
              </svg>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
