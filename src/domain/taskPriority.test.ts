import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import {
  applyBulkPriority,
  DEFAULT_TASK_PRIORITY,
  normalizePriority,
  priorityLabel,
  taskMatchesPriorityFilter,
  uiPriority,
} from './taskPriority'

export type { TaskPriority } from '../types'

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: partial.title ?? partial.id,
    notes: '',
    projectId: 'p1',
    labels: [],
    priority: partial.priority ?? DEFAULT_TASK_PRIORITY,
    segments: [],
    ...partial,
  }
}

describe('REQ-MODEL-006 — Task priority', () => {
  it('defaults missing/invalid to Schedule (q2)', () => {
    expect(normalizePriority(undefined)).toBe('q2')
    expect(normalizePriority('')).toBe('q2')
    expect(normalizePriority('nope')).toBe('q2')
    expect(DEFAULT_TASK_PRIORITY).toBe('q2')
  })

  it('accepts q1–q3 and aliases; maps q4/eliminate to Delegate', () => {
    expect(normalizePriority('q1')).toBe('q1')
    expect(normalizePriority('DoNow')).toBe('q1')
    expect(normalizePriority(3)).toBe('q3')
    expect(normalizePriority('eliminate')).toBe('q3')
    expect(normalizePriority(4)).toBe('q3')
    expect(uiPriority('q4')).toBe('q3')
  })

  it('formats compact labels', () => {
    expect(priorityLabel('q1')).toBe('DoNow')
    expect(priorityLabel('q2')).toBe('Schedule')
    expect(priorityLabel('q3')).toBe('Delegate')
  })

  it('filters by priority', () => {
    const a = task({ id: 'a', priority: 'q1' })
    const b = task({ id: 'b', priority: 'q3' })
    expect(taskMatchesPriorityFilter(a, 'all')).toBe(true)
    expect(taskMatchesPriorityFilter(a, 'q1')).toBe(true)
    expect(taskMatchesPriorityFilter(b, 'q1')).toBe(false)
  })

  it('bulk-assigns priority', () => {
    const next = applyBulkPriority(
      [task({ id: 'a', priority: 'q3' }), task({ id: 'b', priority: 'q1' })],
      'q2',
    )
    expect(next.map((t) => t.priority)).toEqual(['q2', 'q2'])
  })
})
