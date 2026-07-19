import { useState } from 'react'
import App from '../App'
import {
  clearSession,
  isAuthRequired,
  isUnlocked,
  tryUnlock,
} from '../auth/passwordGate'
import { LoginScreen } from './LoginScreen'

/**
 * Shared-password gate around the app.
 * When `VITE_APP_PASSWORD` is unset/empty, renders the app immediately.
 */
export function AuthGate() {
  const required = isAuthRequired()
  const [unlocked, setUnlocked] = useState(() => isUnlocked())

  function handleLock() {
    clearSession()
    setUnlocked(false)
  }

  if (!required || unlocked) {
    return <App onLock={required ? handleLock : undefined} />
  }

  return (
    <LoginScreen
      onSubmit={(password) => {
        if (tryUnlock(password)) {
          setUnlocked(true)
          return true
        }
        return false
      }}
    />
  )
}
