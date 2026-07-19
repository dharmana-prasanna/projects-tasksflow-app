import { describe, expect, it } from 'vitest'
import type { Dependency, Task } from '../types'
import {
  currentDependentIds,
  eligibleDependentTasks,
  planDependentSync,
  toggleId,
} from './taskDependents'

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
})
