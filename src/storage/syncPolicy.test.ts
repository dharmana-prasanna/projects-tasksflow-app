import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { StoreState } from '../types'
import {
  shouldPreferLocalOverRemote,
  shouldSkipEmptyAutoSave,
} from './syncPolicy'

const here = dirname(fileURLToPath(import.meta.url))

const empty: StoreState = {
  projects: [],
  flows: [],
  tasks: [],
  dependencies: [],
  labels: [],
}

function scheduledLocal(): StoreState {
  return {
    projects: [{ id: 'p1', name: 'P', color: '#000' }],
    flows: [{ id: 'f1', name: 'F', color: '#111', projectId: 'p1' }],
    tasks: [
      {
        id: 't1',
        title: 'Local',
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
}

describe('REQ-SYNC-005 — Prefer local after broken remote', () => {
  it('prefers local when remote is empty and local has data', () => {
    expect(shouldPreferLocalOverRemote(empty, scheduledLocal())).toBe(true)
  })

  it('prefers local when remote tasks lack segments but local is scheduled', () => {
    const remote: StoreState = {
      projects: [{ id: 'p1', name: 'P', color: '#000' }],
      flows: [],
      tasks: [
        {
          id: 't1',
          title: 'Broken remote',
          notes: '',
          projectId: 'p1',
          labels: [],
          segments: [],
        },
      ],
      dependencies: [],
      labels: [],
    }
    expect(shouldPreferLocalOverRemote(remote, scheduledLocal())).toBe(true)
  })

  it('does not prefer local when remote has scheduled tasks', () => {
    const remote = scheduledLocal()
    expect(shouldPreferLocalOverRemote(remote, empty)).toBe(false)
  })

  it('does not prefer empty local over empty remote', () => {
    expect(shouldPreferLocalOverRemote(empty, empty)).toBe(false)
  })
})

describe('REQ-SYNC-002 — Empty board save guard', () => {
  it('skips auto-save when board is empty unless explicitly allowed', () => {
    expect(shouldSkipEmptyAutoSave(0)).toBe(true)
    expect(shouldSkipEmptyAutoSave(0, false)).toBe(true)
    expect(shouldSkipEmptyAutoSave(0, true)).toBe(false)
    expect(shouldSkipEmptyAutoSave(1, false)).toBe(false)
  })

  it('Apps Script accepts allowEmptyBoard to clear Tasks rows', () => {
    const gs = readFileSync(
      resolve(here, '../../google-apps-script/Code.gs'),
      'utf8',
    )
    expect(gs).toMatch(/allowEmptyBoard/)
    expect(gs).toMatch(/!opts\.allowEmptyBoard/)
  })

  it('Push confirms before clearing an empty board to Sheets', () => {
    const src = readFileSync(
      resolve(here, '../components/StorageModal.tsx'),
      'utf8',
    )
    expect(src).toMatch(/allowEmptyBoard:\s*true/)
    expect(src).toMatch(/Clear all tasks from Google Sheets/)
  })
})
