import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Dependency, Task } from '../types'
import {
  currentDependentIds,
  eligibleDependentTasks,
  filterDependentTasks,
  planDependentSync,
  toggleId,
} from './taskDependents'

const here = dirname(fileURLToPath(import.meta.url))

const tasks: Task[] = [
  {
    id: 'a',
    title: 'Alpha',
    notes: '',
    projectId: 'p1',
    segments: [],
  },
  {
    id: 'b',
    title: 'Beta',
    notes: '',
    projectId: 'p1',
    segments: [],
  },
  {
    id: 'c',
    title: 'Charlie',
    notes: '',
    projectId: 'p2',
    segments: [],
  },
]

describe('REQ-UI-013 — Pick dependents in task editor', () => {
  it('eligibleDependentTasks excludes the source task and sorts by title', () => {
    expect(eligibleDependentTasks(tasks, 'a').map((t) => t.id)).toEqual([
      'b',
      'c',
    ])
    expect(eligibleDependentTasks(tasks, undefined).map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('currentDependentIds returns toIds on the given flow', () => {
    const deps: Dependency[] = [
      { id: 'd1', fromId: 'a', toId: 'b', flowId: 'f1' },
      { id: 'd2', fromId: 'a', toId: 'c', flowId: 'f2' },
      { id: 'd3', fromId: 'b', toId: 'c', flowId: 'f1' },
    ]
    expect(currentDependentIds(deps, 'a', 'f1')).toEqual(['b'])
    expect(currentDependentIds(deps, 'a', 'f2')).toEqual(['c'])
  })

  it('planDependentSync adds newly selected and removes unchecked on that flow', () => {
    const deps: Dependency[] = [
      { id: 'd1', fromId: 'a', toId: 'b', flowId: 'f1' },
      { id: 'd2', fromId: 'a', toId: 'c', flowId: 'f1' },
      { id: 'd3', fromId: 'a', toId: 'b', flowId: 'f2' },
    ]
    // Keep c, drop b, add (none new) — wait select only c means remove b
    expect(planDependentSync('a', 'f1', ['c'], deps)).toEqual({
      toAdd: [],
      toRemoveIds: ['d1'],
    })
    // Select b and a new imaginary — only existing tasks matter for add
    expect(planDependentSync('a', 'f1', ['b', 'x'], deps)).toEqual({
      toAdd: ['x'],
      toRemoveIds: ['d2'],
    })
  })

  it('planDependentSync ignores self-selection', () => {
    expect(planDependentSync('a', 'f1', ['a', 'b'], [])).toEqual({
      toAdd: ['b'],
      toRemoveIds: [],
    })
  })

  it('toggleId adds and removes ids', () => {
    expect(toggleId(['b'], 'c')).toEqual(['b', 'c'])
    expect(toggleId(['b', 'c'], 'b')).toEqual(['c'])
  })

  it('filterDependentTasks matches title case-insensitively', () => {
    const eligible = eligibleDependentTasks(tasks, 'a')
    expect(filterDependentTasks(eligible, '').map((t) => t.id)).toEqual([
      'b',
      'c',
    ])
    expect(filterDependentTasks(eligible, '   ').map((t) => t.id)).toEqual([
      'b',
      'c',
    ])
    expect(filterDependentTasks(eligible, 'bet').map((t) => t.id)).toEqual([
      'b',
    ])
    expect(filterDependentTasks(eligible, 'CHAR').map((t) => t.id)).toEqual([
      'c',
    ])
    expect(filterDependentTasks(eligible, 'zzz')).toEqual([])
  })

  it('task modal wires a dependents search field', () => {
    const src = readFileSync(
      resolve(here, '../components/TaskModal.tsx'),
      'utf8',
    )
    expect(src).toMatch(/filterDependentTasks/)
    expect(src).toMatch(/dependents__search/)
    expect(src).toMatch(/dependentQuery/)
  })
})
