import { describe, expect, it } from 'vitest'
import {
  addTaskLabel,
  collectAllLabels,
  normalizeLabel,
  normalizeLabels,
  parseLabelsInput,
  removeTaskLabel,
  taskMatchesLabelFilter,
  toggleLabelFilter,
} from './taskLabels'

describe('REQ-MODEL-005 / REQ-UI-017 — Task labels', () => {
  it('normalizes label text and drops empties', () => {
    expect(normalizeLabel('  Trip  ')).toBe('Trip')
    expect(normalizeLabel('   ')).toBeNull()
    expect(normalizeLabel('a'.repeat(40))?.length).toBe(32)
  })

  it('normalizeLabels dedupes case-insensitively and sorts', () => {
    expect(normalizeLabels(['beta', 'Alpha', 'BETA', '  '])).toEqual([
      'Alpha',
      'beta',
    ])
    expect(normalizeLabels('food, Travel; food')).toEqual(['food', 'Travel'])
    expect(normalizeLabels(undefined)).toEqual([])
  })

  it('parseLabelsInput splits on commas/semicolons', () => {
    expect(parseLabelsInput('a, b; c')).toEqual(['a', 'b', 'c'])
  })

  it('collectAllLabels unions labels across tasks', () => {
    expect(
      collectAllLabels([
        { labels: ['Trip', 'food'] },
        { labels: ['trip', 'Kids'] },
        { labels: [] },
      ]),
    ).toEqual(['food', 'Kids', 'Trip'])
  })

  it('taskMatchesLabelFilter uses OR semantics; empty filter matches all', () => {
    const task = { labels: ['Trip', 'food'] }
    expect(taskMatchesLabelFilter(task, [])).toBe(true)
    expect(taskMatchesLabelFilter(task, ['kids'])).toBe(false)
    expect(taskMatchesLabelFilter(task, ['food'])).toBe(true)
    expect(taskMatchesLabelFilter(task, ['kids', 'TRIP'])).toBe(true)
  })

  it('toggleLabelFilter adds and removes', () => {
    expect(toggleLabelFilter(['Trip'], 'food')).toEqual(['food', 'Trip'])
    expect(toggleLabelFilter(['Trip', 'food'], 'trip')).toEqual(['food'])
  })

  it('add/remove task labels', () => {
    expect(addTaskLabel(['a'], 'B')).toEqual(['a', 'B'])
    expect(addTaskLabel(['a'], 'A')).toEqual(['a'])
    expect(removeTaskLabel(['a', 'b'], 'A')).toEqual(['b'])
  })
})
