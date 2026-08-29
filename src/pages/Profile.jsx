import { useAuth } from '../lib/auth.jsx'
import { Button, Card } from '../components/ui.jsx'
import BackLink from '../components/BackLink.jsx'

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-100">{value}</dd>
    </div>
  )
}

export default function Profile() {
  const { user, profile, signOut } = useAuth()
  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/">This week</BackLink>
      <h1 className="text-xl font-semibold text-slate-100">Profile</h1>

      <Card as="dl" className="divide-y divide-slate-800 p-0">
        <Row label="Display name" value={profile?.display_name} />
        <Row label="Handle" value={`@${profile?.handle}`} />
        <Row label="Email" value={user?.email} />
      </Card>

      <Button variant="secondary" full onClick={() => signOut()}>
        Sign out
      </Button>

      <p className="text-xs text-slate-600">
        Editing your handle and display name comes later.
      </p>
    </div>
  )
}
