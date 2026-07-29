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
    labels: [],
    priority: 'q2',
    segments: [],
  },
  {
    id: 'b',
    title: 'Beta',
    notes: '',
    projectId: 'p1',
    labels: [],
    priority: 'q1',
    segments: [],
  },
  {
    id: 'c',
    title: 'Charlie',
    notes: '',
    projectId: 'p2',
    labels: [],
    priority: 'q3',
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

  it('filterDependentTasks ANDs title with priority', () => {
    const eligible = eligibleDependentTasks(tasks, 'a')
    expect(filterDependentTasks(eligible, '', 'q1').map((t) => t.id)).toEqual([
      'b',
    ])
    expect(filterDependentTasks(eligible, '', 'q3').map((t) => t.id)).toEqual([
      'c',
    ])
    expect(filterDependentTasks(eligible, 'char', 'q3').map((t) => t.id)).toEqual(
      ['c'],
    )
    expect(filterDependentTasks(eligible, 'char', 'q1')).toEqual([])
    expect(filterDependentTasks(eligible, '', 'all').map((t) => t.id)).toEqual([
      'b',
      'c',
    ])
  })

  it('task modal wires dependents search, priority filter, and nested edit', () => {
    const src = readFileSync(
      resolve(here, '../components/TaskModal.tsx'),
      'utf8',
    )
    expect(src).toMatch(/filterDependentTasks/)
    expect(src).toMatch(/dependents__search/)
    expect(src).toMatch(/dependentQuery/)
    expect(src).toMatch(/dependentPriority/)
    expect(src).toMatch(/dependents__priority/)
    expect(src).toMatch(/openRelatedTask/)
    expect(src).toMatch(/frameStack/)
    expect(src).toMatch(/close:\s*!nested/)
    expect(src).toMatch(/modal__back/)
  })

  it('dependents search is compact and titles wrap', () => {
    const css = readFileSync(resolve(here, '../App.css'), 'utf8')
    expect(css).toMatch(/\.dependents__search\s*\{[^}]*max-width:\s*16rem/s)
    expect(css).toMatch(/\.dependents__title\s*\{[^}]*white-space:\s*normal/s)
    expect(css).toMatch(/\.dependents__title\s*\{[^}]*overflow-wrap:\s*anywhere/s)
    expect(css).not.toMatch(
      /\.dependents__title\s*\{[^}]*white-space:\s*nowrap/s,
    )
  })

  it('App keeps the modal open on nested save', () => {
    const app = readFileSync(resolve(here, '../App.tsx'), 'utf8')
    expect(app).toMatch(/options\?\.close\s*!==\s*false/)
  })
})
