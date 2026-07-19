import { useState, type FormEvent } from 'react'

type Props = {
  onSubmit: (password: string) => boolean
}

export function LoginScreen({ onSubmit }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const ok = onSubmit(password)
    if (!ok) {
      setError('Incorrect password')
      setPassword('')
      return
    }
    setError(null)
  }

  return (
    <div className="login" role="main">
      <div className="login__panel">
        <div className="login__brand">
          <span className="brand__mark" aria-hidden="true" />
          <h1 className="login__title">Flowboard</h1>
        </div>
        <p className="login__tag">Enter the shared password to open the board.</p>
        <form className="login__form" onSubmit={handleSubmit}>
          <label className="login__label" htmlFor="flowboard-password">
            Password
          </label>
          <input
            id="flowboard-password"
            className="login__input"
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError(null)
            }}
          />
          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary login__submit">
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
