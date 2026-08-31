import { Link, useNavigate, useLocation } from 'react-router-dom'

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

const cls =
  '-ml-1 inline-flex min-h-[36px] items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-200'

// `to` may be a path string, or -1 to go back one step in history (falling back
// to `fallback` when there's nowhere to go back to — e.g. a fresh deep link).
export default function BackLink({ to, fallback = '/', children = 'Back' }) {
  const nav = useNavigate()
  const loc = useLocation()

  if (to === -1) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => (loc.key === 'default' ? nav(fallback) : nav(-1))}
      >
        <Chevron />
        {children}
      </button>
    )
  }

  return (
    <Link to={to} className={cls}>
      <Chevron />
      {children}
    </Link>
  )
}
