import { useId, useState, type FormEvent } from 'react'
import { Button, Field, Input } from '../ui/primitives.tsx'

type AuthMode = 'sign-in' | 'sign-up'

type AuthCardProps = {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
  notice: string | null
  errorMessage: string | null
}

/*
 * Redesigned auth surface. Two modes via an accessible tab switch, one focused
 * card. Supabase auth behaviour is UNCHANGED: sign-in calls `onSignIn`,
 * create-account calls `onSignUp`, and the parent (AuthProvider) owns session
 * handling, email confirmation, profile creation authority, and the
 * profile_missing boundary. Real Supabase errors are shown verbatim.
 */
export function AuthCard({ onSignIn, onSignUp, notice, errorMessage }: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const emailId = useId()
  const passwordId = useId()

  const submitLabel = mode === 'sign-in' ? 'Sign in' : 'Create account'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    if (!email.trim()) {
      setLocalError('Enter your email address.')
      return
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.')
      return
    }

    setPending(true)
    try {
      if (mode === 'sign-up') {
        await onSignUp(email, password)
      } else {
        await onSignIn(email, password)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="vi-authcard">
      <div
        className="vi-segmented vi-authcard__switch"
        role="tablist"
        aria-label="Authentication mode"
      >
        {(['sign-in', 'sign-up'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className="vi-segmented__opt"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value)
              setLocalError(null)
            }}
          >
            {value === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <h1 style={{ fontSize: '1.4rem' }}>
        {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
      </h1>

      <form onSubmit={handleSubmit} noValidate>
        <Field label="Email" htmlFor={emailId}>
          <Input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor={passwordId}>
          <Input
            id={passwordId}
            type="password"
            name="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {localError ? (
          <p className="vi-error-text" role="alert">
            {localError}
          </p>
        ) : null}

        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? 'Working...' : submitLabel}
        </Button>
      </form>

      <div aria-live="polite">
        {notice ? <p className="vi-hint" style={{ color: 'var(--success)' }}>{notice}</p> : null}
        {errorMessage ? (
          <p className="vi-error-text" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  )
}
