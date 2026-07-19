/** Convert a viewport (client) point into coordinates relative to a content root. */
export function clientPointToRoot(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const r = root.getBoundingClientRect()
  return {
    x: clientX - r.left + root.scrollLeft,
    y: clientY - r.top + root.scrollTop,
  }
}

/** Center of an element in the content root's coordinate system. */
export function elementCenterInRoot(
  el: HTMLElement,
  root: HTMLElement,
): { x: number; y: number; w: number; h: number } {
  const er = el.getBoundingClientRect()
  const rr = root.getBoundingClientRect()
  return {
    x: er.left - rr.left + root.scrollLeft + er.width / 2,
    y: er.top - rr.top + root.scrollTop + er.height / 2,
    w: er.width,
    h: er.height,
  }
}

/** Quadratic path used for board dependency arrows. */
export function dependencyPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const cx = x1 + dx * 0.45
  const cy = y1 + dy * 0.15
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

export type GraphCurvePoint = { x: number; y: number }

export type GraphObstacle = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** Clamp bend strength used when an arrow must avoid a box (and the slider). */
export function clampGraphCurve(curve: number): number {
  if (!Number.isFinite(curve)) return 1
  return Math.min(2, Math.max(0.15, Math.round(curve * 100) / 100))
}

export function pointInRect(
  px: number,
  py: number,
  rect: GraphObstacle,
  pad = 2,
): boolean {
  return (
    px >= rect.x - pad &&
    px <= rect.x + rect.width + pad &&
    py >= rect.y - pad &&
    py <= rect.y + rect.height + pad
  )
}

/** True if the segment from (x1,y1)→(x2,y2) crosses the inflated rect. */
export function segmentHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: GraphObstacle,
  pad = 4,
): boolean {
  const left = rect.x - pad
  const right = rect.x + rect.width + pad
  const top = rect.y - pad
  const bottom = rect.y + rect.height + pad

  // Either endpoint inside (shouldn't happen for card sides, but safe)
  if (
    pointInRect(x1, y1, rect, pad) ||
    pointInRect(x2, y2, rect, pad)
  ) {
    return true
  }

  // Sample along the segment
  const steps = 16
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t
    if (x >= left && x <= right && y >= top && y <= bottom) return true
  }
  return false
}

export function lineClearsObstacles(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obstacles: GraphObstacle[],
  excludeIds: Set<string>,
): boolean {
  for (const box of obstacles) {
    if (excludeIds.has(box.id)) continue
    if (segmentHitsRect(x1, y1, x2, y2, box)) return false
  }
  return true
}

function sampleQuad(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  steps = 20,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    pts.push({
      x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
      y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
    })
  }
  return pts
}

export function curveClearsObstacles(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  obstacles: GraphObstacle[],
  excludeIds: Set<string>,
): boolean {
  const pts = sampleQuad(x1, y1, cx, cy, x2, y2)
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    for (const box of obstacles) {
      if (excludeIds.has(box.id)) continue
      if (pointInRect(p.x, p.y, box, 3)) return false
    }
  }
  return true
}

/**
 * Control point offset from the chord midpoint.
 * `side` +1 / -1 picks perpendicular direction; `curve` scales distance.
 */
export function graphEdgeControlPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curve = 1,
  side: 1 | -1 = -1,
  bend: GraphCurvePoint = { x: 0, y: 0 },
): GraphCurvePoint {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  // Unit perpendicular
  let nx = -dy / len
  let ny = dx / len
  // side -1 prefers "up" in SVG when the chord is horizontal-ish
  if (ny * side > 0) {
    nx = -nx
    ny = -ny
  }
  const amount = Math.min(160, Math.max(36, len * 0.32)) * Math.max(0, curve)
  return {
    x: mx + nx * amount * Math.abs(side) + bend.x,
    y: my + ny * amount * Math.abs(side) + bend.y,
  }
}

/** Point on a quadratic Bezier at parameter t (0–1). */
export function pointOnQuadratic(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t = 0.5,
): GraphCurvePoint {
  const mt = 1 - t
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  }
}

/**
 * Control point that places the curve through (px,py) at t=0.5.
 * For quadratic Bezier: B(0.5) = 0.25 P0 + 0.5 C + 0.25 P2.
 */
export function controlPointFromCurveMid(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number,
): GraphCurvePoint {
  return {
    x: 2 * px - (x1 + x2) / 2,
    y: 2 * py - (y1 + y2) / 2,
  }
}

export type RoutedGraphEdge = {
  d: string
  /** Bezier control point (off-curve). */
  cx: number
  cy: number
  /** Handle position on the visible path (mid-curve or mid-line). */
  hx: number
  hy: number
  /** True when the path is curved (obstacle avoidance or manual bend). */
  bent: boolean
}

/**
 * Route a graph arrow:
 * - straight when the line is clear of other task boxes
 * - curved only when it would pass through another box (or user set a bend)
 * - `curve` scales how far avoidance bends push the path
 */
export function routeGraphEdge(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obstacles: GraphObstacle[],
  excludeIds: Set<string>,
  curve = 1,
  bend: GraphCurvePoint = { x: 0, y: 0 },
): RoutedGraphEdge {
  const hasManualBend = Math.abs(bend.x) > 0.5 || Math.abs(bend.y) > 0.5

  if (!hasManualBend && lineClearsObstacles(x1, y1, x2, y2, obstacles, excludeIds)) {
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    return {
      d: `M ${x1} ${y1} L ${x2} ${y2}`,
      cx: mx,
      cy: my,
      hx: mx,
      hy: my,
      bent: false,
    }
  }

  const strength = clampGraphCurve(curve)
  const attempts: Array<{ side: 1 | -1; mult: number }> = [
    { side: -1, mult: strength },
    { side: 1, mult: strength },
    { side: -1, mult: strength * 1.45 },
    { side: 1, mult: strength * 1.45 },
    { side: -1, mult: strength * 1.9 },
    { side: 1, mult: strength * 1.9 },
  ]

  function pack(c: GraphCurvePoint): RoutedGraphEdge {
    const onCurve = pointOnQuadratic(x1, y1, c.x, c.y, x2, y2, 0.5)
    return {
      d: `M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`,
      cx: c.x,
      cy: c.y,
      hx: onCurve.x,
      hy: onCurve.y,
      bent: true,
    }
  }

  for (const attempt of attempts) {
    const c = graphEdgeControlPoint(
      x1,
      y1,
      x2,
      y2,
      attempt.mult,
      attempt.side,
      bend,
    )
    if (
      hasManualBend ||
      curveClearsObstacles(x1, y1, c.x, c.y, x2, y2, obstacles, excludeIds)
    ) {
      return pack(c)
    }
  }

  // Last resort: strongest upward bow
  return pack(graphEdgeControlPoint(x1, y1, x2, y2, strength * 2, -1, bend))
}
