import { Link } from 'react-router-dom'

export default function BackLink({ to, children = 'Back' }) {
  return (
    <Link to={to} className="text-sm font-medium text-slate-400">
      ← {children}
    </Link>
  )
}
