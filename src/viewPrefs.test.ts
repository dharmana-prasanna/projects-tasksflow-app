import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMainView, MAIN_VIEW_KEY, saveMainView } from './viewPrefs'

describe('REQ-LOCAL-006 / REQ-UI-012 — Main view preference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to board', () => {
    expect(MAIN_VIEW_KEY).toBe('flowboard-main-view')
    expect(loadMainView()).toBe('board')
  })

  it('persists graph and board selections', () => {
    saveMainView('graph')
    expect(localStorage.getItem(MAIN_VIEW_KEY)).toBe('graph')
    expect(loadMainView()).toBe('graph')
    saveMainView('board')
    expect(loadMainView()).toBe('board')
  })

  it('treats unknown values as board', () => {
    localStorage.setItem(MAIN_VIEW_KEY, 'timeline')
    expect(loadMainView()).toBe('board')
  })
})
