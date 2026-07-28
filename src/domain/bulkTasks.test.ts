import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import {
  applyBulkLabels,
  moveSelectedTasksToSlot,
  moveTaskToDate,
  moveTasksToDate,
  shouldToggleTaskSelection,
  shiftTaskByDays,
  toggleTaskId,
  unscheduleSelectedTasks,
} from './bulkTasks'

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: partial.title ?? partial.id,
    notes: '',
    projectId: 'p1',
    labels: partial.labels ?? [],
    segments: partial.segments ?? [],
    ...partial,
  }
}

describe('REQ-UI-019 — Multi-select helpers', () => {
  it('toggles selection with modifiers or sticky mode', () => {
    expect(shouldToggleTaskSelection({ metaKey: true }, false)).toBe(true)
    expect(shouldToggleTaskSelection({ ctrlKey: true }, false)).toBe(true)
    expect(shouldToggleTaskSelection({ shiftKey: true }, false)).toBe(true)
    expect(shouldToggleTaskSelection({}, true)).toBe(true)
    expect(shouldToggleTaskSelection({}, false)).toBe(false)
  })

  it('toggleTaskId adds and removes', () => {
    expect(toggleTaskId([], 'a')).toEqual(['a'])
    expect(toggleTaskId(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('REQ-UI-019 — Bulk move to date', () => {
  it('moves earliest segment to target date keeping times', () => {
    const t = task({
      id: 't1',
      segments: [
        {
          date: '2026-07-20',
          startHour: 9,
          startMinute: 0,
          endHour: 9,
          endMinute: 15,
        },
        {
          date: '2026-07-21',
          startHour: 10,
          startMinute: 0,
          endHour: 11,
          endMinute: 0,
        },
      ],
    })
    const moved = moveTaskToDate(t, '2026-07-27')
    expect(moved.segments.map((s) => s.date)).toEqual([
      '2026-07-27',
      '2026-07-28',
    ])
    expect(moved.segments[0].startHour).toBe(9)
    expect(moved.segments[1].startHour).toBe(10)
  })

  it('leaves unscheduled tasks unchanged', () => {
    const t = task({ id: 'u1', segments: [] })
    expect(moveTaskToDate(t, '2026-07-27')).toEqual(t)
  })

  it('moves many tasks independently to the same target date', () => {
    const a = task({
      id: 'a',
      segments: [
        {
          date: '2026-07-18',
          startHour: 8,
          startMinute: 0,
          endHour: 8,
          endMinute: 15,
        },
      ],
    })
    const b = task({
      id: 'b',
      segments: [
        {
          date: '2026-07-22',
          startHour: 14,
          startMinute: 30,
          endHour: 15,
          endMinute: 0,
        },
      ],
    })
    const moved = moveTasksToDate([a, b], '2026-07-25')
    expect(moved[0].segments[0].date).toBe('2026-07-25')
    expect(moved[0].segments[0].startHour).toBe(8)
    expect(moved[1].segments[0].date).toBe('2026-07-25')
    expect(moved[1].segments[0].startMinute).toBe(30)
  })

  it('shiftTaskByDays adjusts all segment dates', () => {
    const t = task({
      id: 't1',
      segments: [
        {
          date: '2026-07-20',
          startHour: 9,
          startMinute: 0,
          endHour: 9,
          endMinute: 15,
        },
      ],
    })
    expect(shiftTaskByDays(t, -2).segments[0].date).toBe('2026-07-18')
  })
})

describe('REQ-UI-019 — Multi-drag relative move', () => {
  it('applies the dragged task’s day/slot delta to all scheduled selected', () => {
    const a = task({
      id: 'a',
      segments: [
        {
          date: '2026-07-20',
          startHour: 9,
          startMinute: 0,
          endHour: 9,
          endMinute: 15,
        },
      ],
    })
    const b = task({
      id: 'b',
      segments: [
        {
          date: '2026-07-20',
          startHour: 11,
          startMinute: 0,
          endHour: 11,
          endMinute: 30,
        },
      ],
    })
    // Drop A at 2026-07-22 10:00 → +2 days, +4 slots
    const moved = moveSelectedTasksToSlot([a, b], 'a', '2026-07-22', 10, 0)
    expect(moved[0].segments[0]).toMatchObject({
      date: '2026-07-22',
      startHour: 10,
      startMinute: 0,
    })
    expect(moved[1].segments[0]).toMatchObject({
      date: '2026-07-22',
      startHour: 12,
      startMinute: 0,
    })
  })

  it('unschedules only scheduled selected tasks', () => {
    const a = task({
      id: 'a',
      segments: [
        {
          date: '2026-07-20',
          startHour: 9,
          startMinute: 0,
          endHour: 9,
          endMinute: 15,
        },
      ],
    })
    const u = task({ id: 'u', segments: [] })
    expect(unscheduleSelectedTasks([a, u])).toEqual([
      { ...a, segments: [] },
    ])
  })
})

describe('REQ-UI-019 — Bulk labels', () => {
  it('adds a label to each task', () => {
    const tasks = [
      task({ id: 'a', labels: ['x'] }),
      task({ id: 'b', labels: [] }),
    ]
    expect(applyBulkLabels(tasks, { add: 'travel' }).map((t) => t.labels)).toEqual([
      ['travel', 'x'],
      ['travel'],
    ])
  })

  it('removes a label from each task', () => {
    const tasks = [
      task({ id: 'a', labels: ['travel', 'x'] }),
      task({ id: 'b', labels: ['travel'] }),
    ]
    expect(applyBulkLabels(tasks, { remove: 'travel' }).map((t) => t.labels)).toEqual([
      ['x'],
      [],
    ])
  })
})
