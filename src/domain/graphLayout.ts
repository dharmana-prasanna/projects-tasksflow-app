import { format, parseISO } from 'date-fns'
import { primarySegment, slotIndex } from '../time'
import type { Task } from '../types'

export type GraphNodeInput = {
  id: string
  title: string
  color: string
  /** YYYY-MM-DD column for this task (earliest segment day). */
  date: string
  /** Start time on that day — used to stack within the column. */
  startHour: number
  startMinute: number
  /** End time on that day — shown on the card (exclusive end). */
  endHour: number
  endMinute: number
}

export type GraphEdgeInput = {
  id: string
  fromId: string
  toId: string
  color: string
  muted?: boolean
}

export type GraphNodeLayout = GraphNodeInput & {
  x: number
  y: number
  width: number
  height: number
  /** Index of the day column (0-based). */
  layer: number
}

export type GraphEdgeLayout = GraphEdgeInput & {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type GraphDayColumn = {
  date: string
  labelName: string
  labelDate: string
  x: number
  width: number
}

export type GraphLayout = {
  nodes: GraphNodeLayout[]
  edges: GraphEdgeLayout[]
  columns: GraphDayColumn[]
  width: number
  height: number
  headerHeight: number
}

export const GRAPH_NODE_WIDTH = 168
/** Compact row: title + time strip. */
export const GRAPH_NODE_HEIGHT = 36
export const GRAPH_GAP_X = 24
export const GRAPH_GAP_Y = 8
export const GRAPH_PAD = 20
export const GRAPH_HEADER_HEIGHT = 42

/** Earliest segment date for a task, or empty if none. */
export function taskColumnDate(task: Pick<Task, 'segments'>): string {
  if (!task.segments?.length) return ''
  return primarySegment(task as Task).date
}

/**
 * Sorted unique dates that have at least one task (by any segment).
 * Only days with ≥1 task become graph columns.
 */
export function daysWithTasks(
  tasks: Pick<Task, 'segments'>[],
): string[] {
  const dates = new Set<string>()
  for (const task of tasks) {
    for (const seg of task.segments ?? []) {
      if (seg.date && /^\d{4}-\d{2}-\d{2}$/.test(seg.date)) {
        dates.add(seg.date)
      }
    }
  }
  return [...dates].sort()
}

/**
 * Assign topological layers (Kahn / BFS levels). Roots are layer 0.
 * Kept for tests / optional ranking within a day.
 */
export function assignLayers(
  nodeIds: string[],
  edges: { fromId: string; toId: string }[],
): Map<string, number> {
  const ids = new Set(nodeIds)
  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const id of ids) {
    outgoing.set(id, [])
    indegree.set(id, 0)
  }
  for (const e of edges) {
    if (!ids.has(e.fromId) || !ids.has(e.toId)) continue
    outgoing.get(e.fromId)!.push(e.toId)
    indegree.set(e.toId, (indegree.get(e.toId) ?? 0) + 1)
  }

  const layers = new Map<string, number>()
  const queue: string[] = []
  for (const id of ids) {
    if ((indegree.get(id) ?? 0) === 0) {
      queue.push(id)
      layers.set(id, 0)
    }
  }

  queue.sort()

  let head = 0
  while (head < queue.length) {
    const id = queue[head++]
    const layer = layers.get(id) ?? 0
    const nexts = [...(outgoing.get(id) ?? [])].sort()
    for (const next of nexts) {
      const nextLayer = Math.max(layers.get(next) ?? 0, layer + 1)
      layers.set(next, nextLayer)
      const deg = (indegree.get(next) ?? 1) - 1
      indegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }

  let max = 0
  for (const v of layers.values()) max = Math.max(max, v)
  for (const id of ids) {
    if (!layers.has(id)) layers.set(id, max + 1)
  }
  return layers
}

/**
 * Lay out a dependency graph in **day columns** (no time rows).
 * Only dates that have at least one task become columns.
 * Each task appears once under its earliest segment date.
 */
export function layoutDependencyGraph(
  nodes: GraphNodeInput[],
  edges: GraphEdgeInput[],
  opts?: {
    nodeWidth?: number
    nodeHeight?: number
    gapX?: number
    gapY?: number
    pad?: number
    headerHeight?: number
    /** Optional ordered day list; defaults to sorted unique node dates. */
    dayColumns?: string[]
  },
): GraphLayout {
  const nodeWidth = opts?.nodeWidth ?? GRAPH_NODE_WIDTH
  const nodeHeight = opts?.nodeHeight ?? GRAPH_NODE_HEIGHT
  const gapX = opts?.gapX ?? GRAPH_GAP_X
  const gapY = opts?.gapY ?? GRAPH_GAP_Y
  const pad = opts?.pad ?? GRAPH_PAD
  const headerHeight = opts?.headerHeight ?? GRAPH_HEADER_HEIGHT

  const columnDates =
    opts?.dayColumns?.length
      ? opts.dayColumns.filter((d) => nodes.some((n) => n.date === d))
      : [...new Set(nodes.map((n) => n.date).filter(Boolean))].sort()

  const colIndex = new Map(columnDates.map((d, i) => [d, i]))

  const byDay = new Map<string, GraphNodeInput[]>()
  for (const date of columnDates) byDay.set(date, [])
  for (const node of nodes) {
    if (!colIndex.has(node.date)) continue
    byDay.get(node.date)!.push(node)
  }

  // Within a day: earliest start time first, then title/id
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const ta = slotIndex(a.startHour, a.startMinute)
      const tb = slotIndex(b.startHour, b.startMinute)
      if (ta !== tb) return ta - tb
      return a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
    })
  }

  const positions = new Map<string, GraphNodeLayout>()
  let maxBottom = pad + headerHeight

  const columns: GraphDayColumn[] = columnDates.map((date, index) => {
    const x = pad + index * (nodeWidth + gapX)
    const d = parseISO(date)
    return {
      date,
      labelName: format(d, 'EEE'),
      labelDate: format(d, 'M/d'),
      x,
      width: nodeWidth,
    }
  })

  for (const col of columns) {
    const list = byDay.get(col.date) ?? []
    list.forEach((node, index) => {
      const y = pad + headerHeight + index * (nodeHeight + gapY)
      positions.set(node.id, {
        ...node,
        x: col.x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        layer: colIndex.get(col.date) ?? 0,
      })
      maxBottom = Math.max(maxBottom, y + nodeHeight)
    })
  }

  const laidNodes = nodes
    .map((n) => positions.get(n.id))
    .filter((n): n is GraphNodeLayout => Boolean(n))

  const colCount = Math.max(1, columns.length)
  const width =
    columns.length === 0
      ? pad * 2 + nodeWidth
      : pad * 2 + colCount * nodeWidth + (colCount - 1) * gapX
  const height = Math.max(pad * 2 + headerHeight + nodeHeight, maxBottom + pad)

  const laidEdges: GraphEdgeLayout[] = []
  for (const edge of edges) {
    const from = positions.get(edge.fromId)
    const to = positions.get(edge.toId)
    if (!from || !to) continue
    // Same column: connect bottom→top; else left/right sides
    const sameCol = from.layer === to.layer
    laidEdges.push({
      ...edge,
      x1: sameCol ? from.x + from.width / 2 : from.x + from.width,
      y1: sameCol ? from.y + from.height : from.y + from.height / 2,
      x2: sameCol ? to.x + to.width / 2 : to.x,
      y2: sameCol ? to.y : to.y + to.height / 2,
    })
  }

  return {
    nodes: laidNodes,
    edges: laidEdges,
    columns,
    width,
    height,
    headerHeight,
  }
}
