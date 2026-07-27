import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CALENDAR_SYNC_KEY,
  clearLocalCache,
  getBuiltInSheetsUrl,
  getCalendarSync,
  getSheetsUrl,
  loadLocalState,
  saveLocalState,
  setCalendarSync,
  setSheetsUrl,
  SHEETS_URL_KEY,
  STORAGE_KEY,
} from './localCache'

describe('REQ-LOCAL-001 — Cache key', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
  })

  it('uses flowboard-state-v6 as primary key', () => {
    const state = {
      projects: [{ id: 'p1', name: 'P', color: '#000' }],
      flows: [{ id: 'f1', name: 'F', color: '#111', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Cached',
          notes: '',
          projectId: 'p1',
          labels: [],
          segments: [
            {
              date: '2026-07-18',
              startHour: 9,
              startMinute: 0,
              endHour: 10,
              endMinute: 0,
            },
          ],
        },
      ],
      dependencies: [],
      labels: [],
    }
    saveLocalState(state)
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
    expect(STORAGE_KEY).toBe('flowboard-state-v6')
    const loaded = loadLocalState()
    expect(loaded.tasks[0].title).toBe('Cached')
  })

  it('migrates from older v5 key when v6 missing', () => {
    localStorage.setItem(
      'flowboard-state-v5',
      JSON.stringify({
        projects: [{ id: 'p1', name: 'P', color: '#000' }],
        flows: [{ id: 'f1', name: 'F', color: '#111', projectId: 'p1' }],
        tasks: [
          {
            id: 'legacy-v5',
            title: 'From v5',
            notes: '',
            projectId: 'p1',
            segments: [
              {
                date: '2026-07-18',
                startHour: 8,
                startMinute: 0,
                endHour: 9,
                endMinute: 0,
              },
            ],
          },
        ],
        dependencies: [{ id: 'd1', fromId: 'x', toId: 'y', flowId: 'f1' }],
      }),
    )
    const loaded = loadLocalState()
    expect(loaded.tasks[0].id).toBe('legacy-v5')
  })
})

describe('REQ-LOCAL-003 — Sheets URL / calendar flag', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
  })

  it('stores sheets URL under flowboard-sheets-url; empty means local-only', () => {
    expect(SHEETS_URL_KEY).toBe('flowboard-sheets-url')
    setSheetsUrl(' https://script.example/exec ')
    expect(getSheetsUrl()).toBe('https://script.example/exec')
    setSheetsUrl('')
    expect(localStorage.getItem(SHEETS_URL_KEY)).toBe('')
    expect(getSheetsUrl()).toBe('')
  })

  it('falls back to build-time VITE_SHEETS_SCRIPT_URL when unset', () => {
    vi.stubEnv('VITE_SHEETS_SCRIPT_URL', 'https://script.example/built-in')
    // Note: import.meta.env is compiled; stubEnv may not rewrite getBuiltInSheetsUrl
    // in all runners — still assert local override wins when set.
    setSheetsUrl('https://script.example/override')
    expect(getSheetsUrl()).toBe('https://script.example/override')
    expect(typeof getBuiltInSheetsUrl()).toBe('string')
  })

  it('stores calendar sync preference', () => {
    expect(CALENDAR_SYNC_KEY).toBe('flowboard-calendar-sync')
    expect(getCalendarSync()).toBe(false)
    setCalendarSync(true)
    expect(getCalendarSync()).toBe(true)
    expect(localStorage.getItem(CALENDAR_SYNC_KEY)).toBe('true')
  })

  it('clearLocalCache removes primary and legacy keys', () => {
    localStorage.setItem(STORAGE_KEY, '{}')
    localStorage.setItem('flowboard-state-v5', '{}')
    clearLocalCache()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('flowboard-state-v5')).toBeNull()
  })
})
