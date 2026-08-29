import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { Button, Field, Input, ErrorText } from '../components/ui.jsx'

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
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="text-center">
        <div className="mx-auto mb-3 text-4xl">🍱</div>
        <h1 className="text-2xl font-bold text-slate-100">Meal Rating</h1>
        <p className="mt-2 text-sm text-slate-400">
          {stage === 'email'
            ? 'Sign in with a code sent to your email.'
            : `We sent a code to ${email}.`}
        </p>
      </div>

      {stage === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <Field label="Email" error={error}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Button type="submit" full size="lg" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <Field label="Login code" error={error}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              autoFocus
              maxLength={8}
              required
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 8))
              }
              placeholder="000000"
              className="text-center text-2xl tracking-[0.4em]"
            />
          </Field>
          <Button type="submit" full size="lg" disabled={busy || code.length < 6}>
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
