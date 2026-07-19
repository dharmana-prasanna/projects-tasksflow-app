import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assignLayers,
  daysWithTasks,
  GRAPH_NODE_HEIGHT,
  layoutDependencyGraph,
  taskColumnDate,
} from './graphLayout'

const here = dirname(fileURLToPath(import.meta.url))

describe('REQ-UI-012 — Dependency graph day columns', () => {
  it('assignLayers puts roots at 0 and dependents downstream', () => {
    const layers = assignLayers(
      ['a', 'b', 'c', 'd'],
      [
        { fromId: 'a', toId: 'b' },
        { fromId: 'b', toId: 'c' },
        { fromId: 'a', toId: 'd' },
      ],
    )
    expect(layers.get('a')).toBe(0)
    expect(layers.get('b')).toBe(1)
    expect(layers.get('d')).toBe(1)
    expect(layers.get('c')).toBe(2)
  })

  it('daysWithTasks returns only dates that have at least one segment', () => {
    expect(
      daysWithTasks([
        {
          segments: [
            {
              date: '2026-07-22',
              startHour: 9,
              startMinute: 0,
              endHour: 10,
              endMinute: 0,
            },
          ],
        },
        {
          segments: [
            {
              date: '2026-07-20',
              startHour: 8,
              startMinute: 0,
              endHour: 9,
              endMinute: 0,
            },
            {
              date: '2026-07-22',
              startHour: 10,
              startMinute: 0,
              endHour: 11,
              endMinute: 0,
            },
          ],
        },
        { segments: [] },
      ]),
    ).toEqual(['2026-07-20', '2026-07-22'])
  })

  it('taskColumnDate uses earliest segment', () => {
    expect(
      taskColumnDate({
        segments: [
          {
            date: '2026-07-22',
            startHour: 9,
            startMinute: 0,
            endHour: 10,
            endMinute: 0,
          },
          {
            date: '2026-07-20',
            startHour: 8,
            startMinute: 0,
            endHour: 9,
            endMinute: 0,
          },
        ],
      }),
    ).toBe('2026-07-20')
  })

  it('layoutDependencyGraph places tasks in day columns (no empty days)', () => {
    const layout = layoutDependencyGraph(
      [
        {
          id: 'a',
          title: 'Ready',
          color: '#111',
          date: '2026-07-20',
          startHour: 5,
          startMinute: 0,
          endHour: 6,
          endMinute: 0,
        },
        {
          id: 'b',
          title: 'Uber',
          color: '#111',
          date: '2026-07-22',
          startHour: 6,
          startMinute: 15,
          endHour: 7,
          endMinute: 0,
        },
        {
          id: 'c',
          title: 'Flight',
          color: '#111',
          date: '2026-07-22',
          startHour: 8,
          startMinute: 30,
          endHour: 10,
          endMinute: 0,
        },
      ],
      [
        { id: 'e1', fromId: 'a', toId: 'b', color: '#f80' },
        { id: 'e2', fromId: 'b', toId: 'c', color: '#f80' },
      ],
    )

    expect(layout.columns.map((c) => c.date)).toEqual([
      '2026-07-20',
      '2026-07-22',
    ])
    expect(layout.columns).toHaveLength(2)

    const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))
    expect(byId.a.layer).toBe(0)
    expect(byId.b.layer).toBe(1)
    expect(byId.c.layer).toBe(1)
    expect(byId.a.x).toBeLessThan(byId.b.x)
    expect(byId.b.x).toBe(byId.c.x)
    // Same day: stacked by start time (Uber 6:15 above Flight 8:30)
    expect(byId.b.y).toBeLessThan(byId.c.y)

    expect(layout.edges).toHaveLength(2)
  })

  it('stacks same-day tasks in time order even when titles sort differently', () => {
    const layout = layoutDependencyGraph(
      [
        {
          id: 'late',
          title: 'AAA early title',
          color: '#1',
          date: '2026-07-22',
          startHour: 14,
          startMinute: 0,
          endHour: 15,
          endMinute: 0,
        },
        {
          id: 'early',
          title: 'ZZZ late title',
          color: '#1',
          date: '2026-07-22',
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      ],
      [],
    )
    const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))
    expect(byId.early.y).toBeLessThan(byId.late.y)
  })

  it('omits day columns that have no tasks even if listed', () => {
    const layout = layoutDependencyGraph(
      [
        {
          id: 'a',
          title: 'Only',
          color: '#1',
          date: '2026-07-21',
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      ],
      [],
      {
        dayColumns: ['2026-07-20', '2026-07-21', '2026-07-22'],
      },
    )
    expect(layout.columns.map((c) => c.date)).toEqual(['2026-07-21'])
  })

  it('is deterministic for the same input', () => {
    const nodes = [
      {
        id: 'b',
        title: 'B',
        color: '#1',
        date: '2026-07-21',
        startHour: 10,
        startMinute: 0,
        endHour: 11,
        endMinute: 0,
      },
      {
        id: 'a',
        title: 'A',
        color: '#2',
        date: '2026-07-20',
        startHour: 9,
        startMinute: 0,
        endHour: 10,
        endMinute: 0,
      },
    ]
    const edges = [{ id: 'e', fromId: 'a', toId: 'b', color: '#f' }]
    expect(layoutDependencyGraph(nodes, edges)).toEqual(
      layoutDependencyGraph(nodes, edges),
    )
  })

  it('keeps start/end times on laid-out nodes for corner labels', () => {
    const layout = layoutDependencyGraph(
      [
        {
          id: 'a',
          title: 'Ready',
          color: '#111',
          date: '2026-07-20',
          startHour: 9,
          startMinute: 15,
          endHour: 11,
          endMinute: 30,
        },
      ],
      [],
    )
    expect(layout.nodes[0]).toMatchObject({
      startHour: 9,
      startMinute: 15,
      endHour: 11,
      endMinute: 30,
      height: GRAPH_NODE_HEIGHT,
    })
    expect(GRAPH_NODE_HEIGHT).toBeGreaterThanOrEqual(56)
  })

  it('renders start/end time corners on graph node cards', () => {
    const css = readFileSync(resolve(here, '../App.css'), 'utf8')
    const src = readFileSync(
      resolve(here, '../components/DependencyGraph.tsx'),
      'utf8',
    )
    expect(css).toMatch(/\.graph-node__time\s*\{/s)
    expect(src).toMatch(/graph-node__time--start/)
    expect(src).toMatch(/graph-node__time--end/)
    expect(src).toMatch(/formatSlot\(node\.startHour/)
    expect(src).toMatch(/formatSlot\(node\.endHour/)
  })
})
