import { describe, expect, it } from 'vitest'
import { migrate } from './migrate'

describe('REQ-LOCAL-002 / REQ-MODEL-* — Migration', () => {
  it('returns null for invalid payloads', () => {
    expect(migrate(null)).toBeNull()
    expect(migrate({})).toBeNull()
    expect(migrate({ tasks: [] })).toBeNull()
  })

  it('converts legacy date/hour/minute to a 15-minute segment', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Legacy',
          date: '2026-07-18',
          hour: 9,
          minute: 0,
          projectId: 'p1',
        },
      ],
      dependencies: [],
    })
    expect(state).not.toBeNull()
    expect(state!.tasks[0].segments).toEqual([
      {
        date: '2026-07-18',
        startHour: 9,
        startMinute: 0,
        endHour: 9,
        endMinute: 15,
      },
    ])
    expect(state!.tasks[0].labels).toEqual([])
    expect(state!.tasks[0].priority).toBe('q2')
  })

  it('normalizes task priority on migrate', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Do now',
          notes: '',
          projectId: 'p1',
          priority: 'do',
          segments: [],
        },
        {
          id: 't2',
          title: 'Later',
          notes: '',
          projectId: 'p1',
          priority: 4,
          segments: [],
        },
      ],
      dependencies: [],
    })
    expect(state!.tasks[0].priority).toBe('q1')
    expect(state!.tasks[1].priority).toBe('q4')
  })

  it('normalizes task labels on migrate', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Labeled',
          projectId: 'p1',
          labels: [' Trip ', 'trip', 'food'],
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
    })
    expect(state!.tasks[0].labels).toEqual(['food', 'Trip'])
    expect(state!.labels).toEqual([
      { name: 'food', description: '' },
      { name: 'Trip', description: '' },
    ])
  })

  it('preserves explicit empty segments as unscheduled', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Backlog',
          projectId: 'p1',
          labels: [],
          segments: [],
        },
      ],
      dependencies: [],
    })
    expect(state!.tasks[0].segments).toEqual([])
  })

  it('keeps unused catalog labels and descriptions on migrate', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Labeled',
          projectId: 'p1',
          labels: ['food'],
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
      labels: [
        { name: 'orphan', description: 'Left over' },
        'food',
      ],
    })
    expect(state!.labels).toEqual([
      { name: 'food', description: '' },
      { name: 'orphan', description: 'Left over' },
    ])
  })

  it('keeps and normalizes existing segments', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Segmented',
          projectId: 'p1',
          segments: [
            {
              date: '2026-07-18',
              startHour: 6,
              startMinute: 7,
              endHour: 7,
              endMinute: 0,
            },
          ],
        },
      ],
      dependencies: [],
    })
    expect(state!.tasks[0].segments[0]).toMatchObject({
      startHour: 6,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
    })
  })

  it('repairs missing projectId with fallback', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 't1',
          title: 'Orphan',
          date: '2026-07-18',
          hour: 9,
          minute: 0,
        },
      ],
      dependencies: [],
    })
    expect(state!.tasks[0].projectId).toBe('p1')
  })

  it('adds Main flow when a project has none', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [],
      tasks: [
        {
          id: 't1',
          title: 'Task',
          date: '2026-07-18',
          hour: 9,
          minute: 0,
          projectId: 'p1',
        },
      ],
      dependencies: [],
    })
    expect(state!.flows).toHaveLength(1)
    expect(state!.flows[0]).toMatchObject({
      projectId: 'p1',
      name: 'Main flow',
    })
  })

  it('assigns default flowId to legacy dependencies', () => {
    const state = migrate({
      projects: [{ id: 'p1', name: 'Alpha', color: '#111' }],
      flows: [{ id: 'f1', name: 'Main', color: '#222', projectId: 'p1' }],
      tasks: [
        {
          id: 'a',
          title: 'A',
          date: '2026-07-18',
          hour: 9,
          minute: 0,
          projectId: 'p1',
        },
        {
          id: 'b',
          title: 'B',
          date: '2026-07-18',
          hour: 10,
          minute: 0,
          projectId: 'p1',
        },
      ],
      dependencies: [{ id: 'd1', fromId: 'a', toId: 'b' }],
    })
    expect(state!.dependencies[0].flowId).toBe('f1')
  })

  it('synthesizes projects from legacy task colors when projects missing', () => {
    const state = migrate({
      tasks: [
        {
          id: 't1',
          title: 'Colored',
          date: '2026-07-18',
          hour: 9,
          minute: 0,
          color: '#ff0000',
        },
      ],
      dependencies: [],
    })
    expect(state!.projects.length).toBeGreaterThan(0)
    expect(state!.tasks[0].projectId).toBeTruthy()
    expect(state!.flows.some((f) => f.projectId === state!.tasks[0].projectId)).toBe(
      true,
    )
  })
})
