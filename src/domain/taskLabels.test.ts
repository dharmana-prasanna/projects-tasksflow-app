import { describe, expect, it } from 'vitest'
import {
  addTaskLabel,
  canDeleteLabel,
  collectAllLabels,
  countTasksWithLabel,
  getLabelDescription,
  labelTooltip,
  mergeLabelCatalog,
  normalizeLabel,
  normalizeLabelDefs,
  normalizeLabels,
  parseLabelsInput,
  removeFromLabelCatalog,
  removeTaskLabel,
  selectLabelFilter,
  taskMatchesLabelFilter,
  toggleLabelFilter,
  upsertLabelDef,
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

  it('selectLabelFilter replaces selection with one label', () => {
    expect(selectLabelFilter('  Travel ')).toEqual(['Travel'])
    expect(selectLabelFilter('   ')).toEqual([])
  })

  it('add/remove task labels', () => {
    expect(addTaskLabel(['a'], 'B')).toEqual(['a', 'B'])
    expect(addTaskLabel(['a'], 'A')).toEqual(['a'])
    expect(removeTaskLabel(['a', 'b'], 'A')).toEqual(['b'])
  })

  it('mergeLabelCatalog keeps unused catalog names and descriptions', () => {
    expect(
      mergeLabelCatalog(
        [{ name: 'orphan', description: 'Unused tag' }, 'Trip'],
        [{ labels: ['trip', 'food'] }],
      ),
    ).toEqual([
      { name: 'food', description: '' },
      { name: 'orphan', description: 'Unused tag' },
      { name: 'Trip', description: '' },
    ])
  })

  it('normalizeLabelDefs / upsertLabelDef keep descriptions', () => {
    expect(
      normalizeLabelDefs(['a', { name: 'b', description: 'Bee' }]),
    ).toEqual([
      { name: 'a', description: '' },
      { name: 'b', description: 'Bee' },
    ])
    const next = upsertLabelDef(
      [{ name: 'Trip', description: 'old' }],
      'trip',
      'Trip-related work',
    )
    expect(next).toEqual([{ name: 'Trip', description: 'Trip-related work' }])
    expect(getLabelDescription(next, 'TRIP')).toBe('Trip-related work')
    expect(labelTooltip(next, 'Trip', 2)).toBe('Trip-related work')
  })

  it('countTasksWithLabel / canDeleteLabel guard deletes', () => {
    const tasks = [
      { labels: ['Trip'] },
      { labels: ['food'] },
      { labels: [] },
    ]
    expect(countTasksWithLabel(tasks, 'trip')).toBe(1)
    expect(canDeleteLabel(tasks, 'Trip')).toBe(false)
    expect(canDeleteLabel(tasks, 'orphan')).toBe(true)
    expect(
      removeFromLabelCatalog(
        [
          { name: 'Trip', description: '' },
          { name: 'orphan', description: 'x' },
        ],
        'orphan',
      ),
    ).toEqual([{ name: 'Trip', description: '' }])
  })
})
