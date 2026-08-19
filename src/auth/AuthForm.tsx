import { useState, type FormEvent } from 'react'

type AuthFormProps = {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
  notice: string | null
  errorMessage: string | null
}

type SubmitMode = 'sign-in' | 'sign-up'

export function AuthForm({
  onSignIn,
  onSignUp,
  notice,
  errorMessage,
}: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pendingMode, setPendingMode] = useState<SubmitMode | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null
    const mode = (submitter?.value as SubmitMode | undefined) ?? 'sign-in'

    setPendingMode(mode)

    try {
      if (mode === 'sign-up') {
        await onSignUp(email, password)
        return
      }

      await onSignIn(email, password)
    } finally {
      setPendingMode(null)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <p className="eyebrow">Private collection</p>
      <h1 id="auth-title">Vinyl Intelligence</h1>
      <p className="lede">
        Sign in to manage your personal vinyl collection.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label>
          Password
          <input
            autoComplete="current-password"
            minLength={6}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        <div className="auth-actions">
          <button disabled={pendingMode !== null} type="submit" value="sign-in">
            {pendingMode === 'sign-in' ? 'Signing in...' : 'Sign in'}
          </button>
          <button disabled={pendingMode !== null} type="submit" value="sign-up">
            {pendingMode === 'sign-up' ? 'Creating...' : 'Create account'}
          </button>
        </div>
      </form>

      {notice ? <p className="notice">{notice}</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </section>
  )
}
