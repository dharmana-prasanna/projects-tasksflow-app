/** Session key for the shared-password gate (tab-scoped). */
export const AUTH_SESSION_KEY = 'flowboard-auth-session'

/**
 * Build-time shared password from Vite env.
 * Empty / unset → gate disabled (open app).
 * Note: Vite embeds `VITE_*` values in the client bundle — this is a casual
 * shared gate, not strong server-side authentication.
 */
export function getAppPassword(
  envPassword: string | undefined = import.meta.env.VITE_APP_PASSWORD,
): string {
  return typeof envPassword === 'string' ? envPassword.trim() : ''
}

export function isAuthRequired(password = getAppPassword()): boolean {
  return password.length > 0
}

/** Deterministic session token derived from the configured password. */
export function sessionTokenFor(password: string): string {
  let h = 2166136261
  const salt = 'flowboard-auth-v1'
  const raw = `${salt}:${password}`
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `v1_${(h >>> 0).toString(16)}`
}

export function readSessionToken(
  storage: Pick<Storage, 'getItem'> = sessionStorage,
): string | null {
  try {
    return storage.getItem(AUTH_SESSION_KEY)
  } catch {
    return null
  }
}

export function writeSessionToken(
  token: string,
  storage: Pick<Storage, 'setItem'> = sessionStorage,
): void {
  storage.setItem(AUTH_SESSION_KEY, token)
}

export function clearSession(
  storage: Pick<Storage, 'removeItem'> = sessionStorage,
): void {
  try {
    storage.removeItem(AUTH_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** True when gate is off, or session token matches the configured password. */
export function isUnlocked(
  password = getAppPassword(),
  storage: Pick<Storage, 'getItem'> = sessionStorage,
): boolean {
  if (!isAuthRequired(password)) return true
  return readSessionToken(storage) === sessionTokenFor(password)
}

/**
 * Unlock when `input` exactly matches the configured password.
 * Returns false on mismatch (and does not clear an existing session).
 */
export function tryUnlock(
  input: string,
  password = getAppPassword(),
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
): boolean {
  if (!isAuthRequired(password)) return true
  if (input !== password) return false
  writeSessionToken(sessionTokenFor(password), storage)
  return true
}
