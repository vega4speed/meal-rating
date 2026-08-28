import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { Button, Field, Input } from '../components/ui.jsx'

export default function SignIn() {
  const { signInWithOtp, verifyOtp } = useAuth()
  const [stage, setStage] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function sendCode(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signInWithOtp(email.trim())
    setBusy(false)
    if (error) setError(error.message)
    else setStage('code')
  }

  async function submitCode(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await verifyOtp(email.trim(), code.trim())
    setBusy(false)
    if (error) setError(error.message)
    // On success the auth listener swaps the whole tree — nothing to do here.
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-100">Meal Rating</h1>
        <p className="mt-1 text-sm text-slate-400">
          {stage === 'email'
            ? 'Sign in with a code sent to your email.'
            : `Enter the 6-digit code sent to ${email}.`}
        </p>
      </div>

      {stage === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <Field label="Email" error={error}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Button type="submit" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <Field label="6-digit code" error={error}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
            />
          </Field>
          <Button type="submit" disabled={busy || code.length < 6}>
            {busy ? 'Verifying…' : 'Verify'}
          </Button>
          <button
            type="button"
            className="text-sm font-medium text-slate-400"
            onClick={() => {
              setStage('email')
              setCode('')
              setError(null)
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  )
}
