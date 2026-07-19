import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GRAPH_BENDS_KEY,
  GRAPH_CURVE_KEY,
  loadGraphBends,
  loadGraphCurve,
  saveGraphBends,
  saveGraphCurve,
} from './graphCurvePrefs'

describe('REQ-LOCAL-007 — Graph arrow curve prefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults curve to 1 and persists clamped values', () => {
    expect(GRAPH_CURVE_KEY).toBe('flowboard-graph-curve')
    expect(loadGraphCurve()).toBe(1)
    saveGraphCurve(1.5)
    expect(loadGraphCurve()).toBe(1.5)
    saveGraphCurve(9)
    expect(loadGraphCurve()).toBe(2)
  })

  it('persists per-edge bend offsets', () => {
    expect(GRAPH_BENDS_KEY).toBe('flowboard-graph-bends')
    saveGraphBends({ d1: { x: 12, y: -8 } })
    expect(loadGraphBends()).toEqual({ d1: { x: 12, y: -8 } })
  })
})
