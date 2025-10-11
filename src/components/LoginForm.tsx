import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase/config'

const LoginForm = () => {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signIn(email, password)
    } catch (err) {
      setError('Unable to sign in. Double-check your email and password.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = async () => {
    setResetError(null)
    setResetSent(false)
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setResetError('Enter a valid email address above to reset your password.')
      return
    }
    setResetSending(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setResetSent(true)
    } catch (e) {
      console.error(e)
      setResetError('Unable to send reset email. Please try again.')
    } finally {
      setResetSending(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Sign In</h2>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoComplete="email"
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        autoComplete="current-password"
      />
      {error ? <p className="error">{error}</p> : null}
      {resetError ? <p className="error">{resetError}</p> : null}
      {resetSent ? <p className="hint">Reset email sent. Check your inbox.</p> : null}
      <div className="actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing In…' : 'Sign In'}
        </button>
        <button type="button" className="ghost-button" onClick={handleReset} disabled={resetSending}>
          {resetSending ? 'Sending…' : 'Forgot password?'}
        </button>
      </div>
    </form>
  )
}

export default LoginForm
