import { describe, expect, it } from 'vitest'
import {
  filterScheduledTasks,
  filterUnscheduledTasks,
  isTaskUnscheduled,
  unscheduleTask,
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

  it('unscheduleTask clears segments for backlog return', () => {
    const task = {
      id: 't1',
      title: 'Recap',
      notes: '',
      projectId: 'p1',
      labels: ['travel'],
      segments: [
        {
          date: '2026-07-25',
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      ],
    }
    const next = unscheduleTask(task)
    expect(next.segments).toEqual([])
    expect(next.title).toBe('Recap')
    expect(isTaskUnscheduled(next)).toBe(true)
  })
})
