import { Link } from 'react-router-dom'

export default function BackLink({ to, children = 'Back' }) {
  return (
    <Link
      to={to}
      className="-ml-1 inline-flex min-h-[36px] items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-200"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </Link>
  )
}
