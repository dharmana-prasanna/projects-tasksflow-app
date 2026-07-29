import type { StoreState } from '../types'

export const PROJECT_COLORS = [
  '#1f6b5a',
  '#1d4e89',
  '#8a4b1f',
  '#5b3d8a',
  '#8a2f45',
  '#2f6f8a',
]

/** Distinct palette for flow arrows (separate from project/task chip colors) */
export const FLOW_COLORS = [
  '#e07a2f',
  '#c23b6e',
  '#2a9d8f',
  '#6a4c93',
  '#d4a017',
  '#3d5a80',
]

/** Seed data matching the sketch (week of Jul 20, 2026). */
export const SAMPLE_STATE: StoreState = {
  projects: [
    { id: 'proj-alpha', name: 'Alpha Launch', color: '#1f6b5a' },
    { id: 'proj-beta', name: 'Beta Ops', color: '#1d4e89' },
    { id: 'proj-gamma', name: 'Gamma Review', color: '#8a4b1f' },
  ],
  flows: [
    {
      id: 'flow-pipeline',
      name: 'Pipeline',
      color: '#e07a2f',
      projectId: 'proj-alpha',
    },
    {
      id: 'flow-branch',
      name: 'Branch',
      color: '#c23b6e',
      projectId: 'proj-alpha',
    },
    {
      id: 'flow-ops',
      name: 'Ops chain',
      color: '#2a9d8f',
      projectId: 'proj-beta',
    },
  ],
  tasks: [
    {
      id: 'task1',
      title: 'task1',
      notes: 'Kickoff',
      projectId: 'proj-alpha',
      labels: ['planning', 'kickoff'],
      priority: 'q1',
      segments: [
        {
          date: '2026-07-20',
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      ],
    },
    {
      id: 'task2',
      title: 'task2',
      notes: '',
      projectId: 'proj-alpha',
      labels: ['build'],
      priority: 'q2',
      segments: [
        {
          date: '2026-07-21',
          startHour: 10,
          startMinute: 0,
          endHour: 11,
          endMinute: 0,
        },
      ],
    },
    {
      id: 'task3',
      title: 'task3',
      notes: '',
      projectId: 'proj-alpha',
      labels: [],
      priority: 'q2',
      segments: [
        {
          date: '2026-07-21',
          startHour: 10,
          startMinute: 30,
          endHour: 11,
          endMinute: 30,
        },
      ],
    },
    {
      id: 'task4',
      title: 'task4',
      notes: '',
      projectId: 'proj-alpha',
      labels: [],
      priority: 'q3',
      segments: [
        {
          date: '2026-07-21',
          startHour: 11,
          startMinute: 0,
          endHour: 12,
          endMinute: 0,
        },
      ],
    },
    {
      id: 'task5',
      title: 'task5',
      notes: '',
      projectId: 'proj-beta',
      labels: ['travel', 'multi-day'],
      priority: 'q2',
      segments: [
        {
          date: '2026-07-22',
          startHour: 9,
          startMinute: 15,
          endHour: 10,
          endMinute: 15,
        },
        {
          date: '2026-07-23',
          startHour: 9,
          startMinute: 0,
          endHour: 12,
          endMinute: 0,
        },
      ],
    },
    {
      id: 'task6',
      title: 'task6',
      notes: '',
      projectId: 'proj-beta',
      labels: [],
      priority: 'q3',
      segments: [
        {
          date: '2026-07-24',
          startHour: 13,
          startMinute: 0,
          endHour: 14,
          endMinute: 0,
        },
      ],
    },
  ],
  dependencies: [
    { id: 'dep1', fromId: 'task1', toId: 'task2', flowId: 'flow-pipeline' },
    { id: 'dep3', fromId: 'task2', toId: 'task4', flowId: 'flow-pipeline' },
    { id: 'dep2', fromId: 'task1', toId: 'task3', flowId: 'flow-branch' },
    { id: 'dep4', fromId: 'task5', toId: 'task6', flowId: 'flow-ops' },
  ],
  labels: [
    { name: 'build', description: '' },
    { name: 'kickoff', description: '' },
    { name: 'multi-day', description: '' },
    { name: 'planning', description: '' },
    { name: 'travel', description: '' },
  ],
}

/** @deprecated use PROJECT_COLORS */
export const TASK_COLORS = PROJECT_COLORS
