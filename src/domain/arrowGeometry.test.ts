import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  clampGraphCurve,
  clientPointToRoot,
  controlPointFromCurveMid,
  dependencyPath,
  elementCenterInRoot,
  lineClearsObstacles,
  pointOnQuadratic,
  routeGraphEdge,
  segmentHitsRect,
} from './arrowGeometry'

const here = dirname(fileURLToPath(import.meta.url))

describe('REQ-UI-010 — Dependency arrow geometry', () => {
  it('clientPointToRoot subtracts root viewport origin and adds scroll', () => {
    const root = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        right: 500,
        bottom: 600,
        width: 400,
        height: 400,
      }),
      scrollLeft: 30,
      scrollTop: 40,
    } as HTMLElement

    expect(clientPointToRoot(root, 150, 260)).toEqual({ x: 80, y: 100 })
  })

  it('elementCenterInRoot is stable relative to the content root', () => {
    const root = {
      getBoundingClientRect: () => ({
        left: 50,
        top: 80,
        right: 450,
        bottom: 480,
        width: 400,
        height: 400,
      }),
      scrollLeft: 0,
      scrollTop: 120,
    } as HTMLElement

    const el = {
      getBoundingClientRect: () => ({
        left: 150,
        top: 200,
        right: 250,
        bottom: 260,
        width: 100,
        height: 60,
      }),
    } as HTMLElement

    expect(elementCenterInRoot(el, root)).toEqual({
      x: 150 - 50 + 0 + 50,
      y: 200 - 80 + 120 + 30,
      w: 100,
      h: 60,
    })
  })

  it('dependencyPath builds a quadratic curve between endpoints', () => {
    expect(dependencyPath(0, 0, 100, 100)).toBe('M 0 0 Q 45 15 100 100')
  })
})

describe('REQ-UI-012 — Obstacle-aware graph arrows', () => {
  const midBox = {
    id: 'mid',
    x: 80,
    y: 20,
    width: 40,
    height: 40,
  }

  it('detects when a straight segment crosses a box', () => {
    expect(segmentHitsRect(0, 40, 200, 40, midBox)).toBe(true)
    expect(segmentHitsRect(0, 0, 200, 0, midBox)).toBe(false)
  })

  it('stays straight when the path is clear', () => {
    const routed = routeGraphEdge(
      0,
      40,
      200,
      40,
      [],
      new Set(['a', 'b']),
      1,
    )
    expect(routed.bent).toBe(false)
    expect(routed.d).toBe('M 0 40 L 200 40')
  })

  it('bends only when the straight line would hit another box', () => {
    const clear = routeGraphEdge(
      0,
      40,
      200,
      40,
      [midBox],
      new Set(['mid']), // excluded — treat as endpoint
      1,
    )
    expect(clear.bent).toBe(false)

    const blocked = routeGraphEdge(
      0,
      40,
      200,
      40,
      [midBox],
      new Set(['from', 'to']),
      1,
    )
    expect(blocked.bent).toBe(true)
    expect(blocked.d).toContain(' Q ')
    expect(lineClearsObstacles(0, 40, 200, 40, [midBox], new Set())).toBe(false)
  })

  it('higher bend strength moves the control point farther when blocked', () => {
    const mild = routeGraphEdge(0, 40, 200, 40, [midBox], new Set(), 0.3)
    const strong = routeGraphEdge(0, 40, 200, 40, [midBox], new Set(), 1.8)
    expect(mild.bent).toBe(true)
    expect(strong.bent).toBe(true)
    const mildDist = Math.hypot(mild.cx - 100, mild.cy - 40)
    const strongDist = Math.hypot(strong.cx - 100, strong.cy - 40)
    expect(strongDist).toBeGreaterThan(mildDist)
  })

  it('clampGraphCurve keeps strength in range', () => {
    expect(clampGraphCurve(0)).toBe(0.15)
    expect(clampGraphCurve(3)).toBe(2)
    expect(clampGraphCurve(1.234)).toBe(1.23)
  })

  it('places the handle on the visible curve, not at the off-curve control', () => {
    const routed = routeGraphEdge(0, 40, 200, 40, [midBox], new Set(), 1)
    expect(routed.bent).toBe(true)
    const onCurve = pointOnQuadratic(
      0,
      40,
      routed.cx,
      routed.cy,
      200,
      40,
      0.5,
    )
    expect(routed.hx).toBeCloseTo(onCurve.x)
    expect(routed.hy).toBeCloseTo(onCurve.y)
    // Control point sits off the path; handle should not equal it for a bow
    expect(Math.hypot(routed.hx - routed.cx, routed.hy - routed.cy)).toBeGreaterThan(
      1,
    )
  })

  it('controlPointFromCurveMid round-trips through the mid-curve point', () => {
    const c = controlPointFromCurveMid(0, 0, 100, 0, 50, -20)
    const mid = pointOnQuadratic(0, 0, c.x, c.y, 100, 0, 0.5)
    expect(mid.x).toBeCloseTo(50)
    expect(mid.y).toBeCloseTo(-20)
  })
})

describe('REQ-UI-010 — Arrow overlay CSS contract', () => {
  const appCss = readFileSync(resolve(here, '../App.css'), 'utf8')

  it('draws arrows inside the board canvas, not as a fixed page overlay', () => {
    expect(appCss).toMatch(/\.board-canvas\s*\{[^}]*position:\s*relative/s)
    expect(appCss).toMatch(/\.dep-overlay\s*\{[^}]*position:\s*absolute/s)
    expect(appCss).not.toMatch(/\.dep-overlay\s*\{[^}]*position:\s*fixed/s)
  })
})
