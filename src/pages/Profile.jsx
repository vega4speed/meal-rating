import { useAuth } from '../lib/auth.jsx'
import { Button } from '../components/ui.jsx'

export default function Profile() {
  const { user, profile, signOut } = useAuth()
  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="text-xl font-semibold text-slate-100">Profile</h1>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Display name</dt>
          <dd className="text-slate-100">{profile?.display_name}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Handle</dt>
          <dd className="text-slate-100">@{profile?.handle}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="text-slate-100">{user?.email}</dd>
        </div>
      </dl>
      <Button
        className="bg-slate-800 text-slate-100"
        onClick={() => signOut()}
      >
        Sign out
      </Button>
      <p className="text-xs text-slate-600">
        Editing your handle and display name comes in a later phase.
      </p>
    </div>
  )
}
