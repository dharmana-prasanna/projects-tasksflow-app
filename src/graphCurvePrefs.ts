import { clampGraphCurve, type GraphCurvePoint } from './domain/arrowGeometry'

export const GRAPH_CURVE_KEY = 'flowboard-graph-curve'
export const GRAPH_BENDS_KEY = 'flowboard-graph-bends'

export type GraphBendMap = Record<string, GraphCurvePoint>

export function loadGraphCurve(): number {
  try {
    const raw = localStorage.getItem(GRAPH_CURVE_KEY)
    if (raw == null) return 1
    return clampGraphCurve(Number(raw))
  } catch {
    return 1
  }
}

export function saveGraphCurve(curve: number): void {
  localStorage.setItem(GRAPH_CURVE_KEY, String(clampGraphCurve(curve)))
}

export function loadGraphBends(): GraphBendMap {
  try {
    const raw = localStorage.getItem(GRAPH_BENDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: GraphBendMap = {}
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const pt = v as { x?: unknown; y?: unknown }
      if (typeof pt.x === 'number' && typeof pt.y === 'number') {
        out[id] = { x: pt.x, y: pt.y }
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveGraphBends(bends: GraphBendMap): void {
  localStorage.setItem(GRAPH_BENDS_KEY, JSON.stringify(bends))
}
