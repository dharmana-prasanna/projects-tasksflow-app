import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_SESSION_KEY,
  clearSession,
  isAuthRequired,
  isUnlocked,
  normalizeAppPassword,
  readSessionToken,
  sessionTokenFor,
  tryUnlock,
  writeSessionToken,
} from './passwordGate'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

describe('REQ-AUTH-001 — Shared password gate config', () => {
  it('trims configured password and treats empty as disabled', () => {
    // Normalize is pure — do not call getAppPassword(undefined): that would
    // fall through to import.meta.env and fail Netlify builds when the var is set.
    expect(normalizeAppPassword('  secret  ')).toBe('secret')
    expect(normalizeAppPassword('')).toBe('')
    expect(normalizeAppPassword('   ')).toBe('')
    expect(normalizeAppPassword(undefined)).toBe('')
    expect(isAuthRequired('')).toBe(false)
    expect(isAuthRequired('secret')).toBe(true)
  })
})

describe('REQ-AUTH-002 — Unlock / session', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
  })

  afterEach(() => {
    storage.clear()
  })

  it('is unlocked when auth is not required', () => {
    expect(isUnlocked('', storage)).toBe(true)
    expect(tryUnlock('anything', '', storage)).toBe(true)
  })

  it('rejects wrong password and leaves session empty', () => {
    expect(tryUnlock('nope', 'secret', storage)).toBe(false)
    expect(readSessionToken(storage)).toBeNull()
    expect(isUnlocked('secret', storage)).toBe(false)
  })

  it('accepts exact password and persists a session token', () => {
    expect(tryUnlock('secret', 'secret', storage)).toBe(true)
    expect(readSessionToken(storage)).toBe(sessionTokenFor('secret'))
    expect(isUnlocked('secret', storage)).toBe(true)
  })

  it('invalidates session when configured password changes', () => {
    writeSessionToken(sessionTokenFor('old'), storage)
    expect(isUnlocked('old', storage)).toBe(true)
    expect(isUnlocked('new', storage)).toBe(false)
  })

  it('clearSession locks the app again', () => {
    tryUnlock('secret', 'secret', storage)
    clearSession(storage)
    expect(storage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(isUnlocked('secret', storage)).toBe(false)
  })

  it('session tokens are stable for the same password', () => {
    expect(sessionTokenFor('abc')).toBe(sessionTokenFor('abc'))
    expect(sessionTokenFor('abc')).not.toBe(sessionTokenFor('abd'))
  })
})
