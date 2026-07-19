import { describe, expect, it } from 'vitest'
import type { Dependency } from '../types'
import {
  taskHasValidScheduleDate,
  validateNewDependency,
  wouldCreateCycle,
} from './dependencies'

const deps = (edges: [string, string, string?][]): Dependency[] =>
  edges.map(([fromId, toId, flowId = 'f1'], i) => ({
    id: `d${i}`,
    fromId,
    toId,
    flowId,
  }))

describe('REQ-DEP-001 — Self link', () => {
  it('rejects fromId === toId', () => {
    expect(validateNewDependency([], 'a', 'a', 'f1')).toEqual({
      ok: false,
      reason: 'A task cannot depend on itself.',
    })
  })
})

describe('REQ-DEP-002 — Missing flow', () => {
  it('rejects empty flowId', () => {
    expect(validateNewDependency([], 'a', 'b', '')).toEqual({
      ok: false,
      reason: 'Select a flow before linking tasks.',
    })
  })
})

describe('REQ-DEP-003 — Duplicate', () => {
  it('rejects same from/to/flow', () => {
    const existing = deps([['a', 'b', 'f1']])
    expect(validateNewDependency(existing, 'a', 'b', 'f1')).toEqual({
      ok: false,
      reason: 'That dependency already exists on this flow.',
    })
  })

  it('allows same from/to on a different flow', () => {
    const existing = deps([['a', 'b', 'f1']])
    expect(validateNewDependency(existing, 'a', 'b', 'f2')).toEqual({ ok: true })
  })
})

describe('REQ-DEP-004 — Cycle detection', () => {
  it('detects direct cycle A→B when B→A exists', () => {
    expect(wouldCreateCycle(deps([['b', 'a']]), 'a', 'b')).toBe(true)
  })

  it('detects transitive cycle A→C when A→B→C path would close', () => {
    // existing B→C, C→A; adding A→B creates A→B→C→A
    expect(wouldCreateCycle(deps([['b', 'c'], ['c', 'a']]), 'a', 'b')).toBe(true)
  })

  it('allows acyclic edges', () => {
    expect(wouldCreateCycle(deps([['a', 'b']]), 'b', 'c')).toBe(false)
    expect(validateNewDependency(deps([['a', 'b']]), 'b', 'c', 'f1')).toEqual({
      ok: true,
    })
  })
})

describe('REQ-DEP-005 / REQ-MODEL-004 — Cross-project links', () => {
  it('validation does not require same project (pure graph rules only)', () => {
    // Cross-project is enforced only by store existence checks; domain allows any ids.
    expect(validateNewDependency([], 'task-proj-a', 'task-proj-b', 'f1')).toEqual({
      ok: true,
    })
  })
})

describe('REQ-SYNC-004 — Valid schedule date helper', () => {
  it('accepts YYYY-MM-DD segment dates', () => {
    expect(
      taskHasValidScheduleDate({
        segments: [{ date: '2026-07-21' }],
      }),
    ).toBe(true)
  })

  it('rejects empty or malformed dates', () => {
    expect(taskHasValidScheduleDate({ segments: [{ date: '' }] })).toBe(false)
    expect(taskHasValidScheduleDate({ segments: [{ date: 'bad' }] })).toBe(false)
    expect(taskHasValidScheduleDate({ segments: [] })).toBe(false)
    expect(taskHasValidScheduleDate({ date: '' })).toBe(false)
  })

  it('falls back to legacy task.date', () => {
    expect(taskHasValidScheduleDate({ date: '2026-07-21' })).toBe(true)
  })
})
