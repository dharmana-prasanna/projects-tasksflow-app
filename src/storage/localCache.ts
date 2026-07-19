import { SAMPLE_STATE } from '../data/sample'
import type { StoreState } from '../types'
import { migrate } from './migrate'

export const STORAGE_KEY = 'flowboard-state-v6'
export const UPDATED_AT_KEY = 'flowboard-updated-at'
export const SHEETS_URL_KEY = 'flowboard-sheets-url'
export const CALENDAR_SYNC_KEY = 'flowboard-calendar-sync'

export function loadLocalState(): StoreState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('flowboard-state-v5') ??
      localStorage.getItem('flowboard-state-v4') ??
      localStorage.getItem('flowboard-state-v3') ??
      localStorage.getItem('flowboard-state-v2') ??
      localStorage.getItem('flowboard-state-v1')
    if (!raw) return structuredClone(SAMPLE_STATE)
    const migrated = migrate(JSON.parse(raw))
    if (!migrated) return structuredClone(SAMPLE_STATE)

    const sampleIds = new Set(SAMPLE_STATE.tasks.map((t) => t.id))
    const looksLikeBrokenSample =
      migrated.tasks.length > 0 &&
      migrated.tasks.every((t) => sampleIds.has(t.id)) &&
      migrated.dependencies.length === 0
    if (looksLikeBrokenSample) return structuredClone(SAMPLE_STATE)

    return migrated
  } catch {
    return structuredClone(SAMPLE_STATE)
  }
}

export function saveLocalState(state: StoreState, updatedAt?: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  if (updatedAt) localStorage.setItem(UPDATED_AT_KEY, updatedAt)
}

export function getLocalUpdatedAt(): string {
  return localStorage.getItem(UPDATED_AT_KEY) ?? ''
}

/** Sheets URL baked in at build time (Netlify / Vite env). */
export function getBuiltInSheetsUrl(): string {
  return String(import.meta.env.VITE_SHEETS_SCRIPT_URL ?? '').trim()
}

/**
 * Active Sheets URL:
 * - If the user has saved a value in localStorage (including empty = local-only), use that.
 * - Otherwise fall back to the build-time `VITE_SHEETS_SCRIPT_URL`.
 */
export function getSheetsUrl(): string {
  const stored = localStorage.getItem(SHEETS_URL_KEY)
  if (stored !== null) return stored.trim()
  return getBuiltInSheetsUrl()
}

export function setSheetsUrl(url: string) {
  // Always write a key so an empty value means "local only" and does not
  // silently fall back to the built-in env URL after Disconnect.
  localStorage.setItem(SHEETS_URL_KEY, url.trim())
}

export function getCalendarSync(): boolean {
  return localStorage.getItem(CALENDAR_SYNC_KEY) === 'true'
}

export function setCalendarSync(enabled: boolean) {
  localStorage.setItem(CALENDAR_SYNC_KEY, enabled ? 'true' : 'false')
}

export function clearLocalCache() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(UPDATED_AT_KEY)
  // Drop URL override so the built-in env URL applies again after sample reset.
  localStorage.removeItem(SHEETS_URL_KEY)
  for (const key of [
    'flowboard-state-v1',
    'flowboard-state-v2',
    'flowboard-state-v3',
    'flowboard-state-v4',
    'flowboard-state-v5',
  ]) {
    localStorage.removeItem(key)
  }
}
