import { describe, expect, it } from 'vitest'
import type { StoreState } from '../types'
import { shouldPreferLocalOverRemote } from './syncPolicy'

const empty: StoreState = {
  projects: [],
  flows: [],
  tasks: [],
  dependencies: [],
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
          segments: [],
        },
      ],
      dependencies: [],
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
