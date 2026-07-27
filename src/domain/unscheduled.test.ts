import { describe, expect, it } from 'vitest'
import {
  filterScheduledTasks,
  filterUnscheduledTasks,
  isTaskUnscheduled,
} from './unscheduled'

describe('REQ-UI-018 — Unscheduled backlog', () => {
  it('treats empty segments as unscheduled', () => {
    expect(isTaskUnscheduled({ segments: [] })).toBe(true)
    expect(isTaskUnscheduled({ segments: undefined })).toBe(true)
    expect(
      isTaskUnscheduled({
        segments: [
          {
            date: '2026-07-27',
            startHour: 9,
            startMinute: 0,
            endHour: 10,
            endMinute: 0,
          },
        ],
      }),
    ).toBe(false)
  })

  it('filters backlog vs scheduled lists', () => {
    const tasks = [
      { id: 'a', segments: [] },
      {
        id: 'b',
        segments: [
          {
            date: '2026-07-27',
            startHour: 9,
            startMinute: 0,
            endHour: 10,
            endMinute: 0,
          },
        ],
      },
    ]
    expect(filterUnscheduledTasks(tasks).map((t) => t.id)).toEqual(['a'])
    expect(filterScheduledTasks(tasks).map((t) => t.id)).toEqual(['b'])
  })
})
