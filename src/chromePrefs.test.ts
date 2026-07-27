import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CHROME_MINIMIZED_KEY,
  isNarrowViewport,
  loadChromeMinimized,
  saveChromeMinimized,
} from './chromePrefs'

const here = dirname(fileURLToPath(import.meta.url))

describe('REQ-UI-011 / REQ-LOCAL-005 — Minimizable chrome', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to expanded on wide viewports when no preference saved', () => {
    expect(CHROME_MINIMIZED_KEY).toBe('flowboard-chrome-minimized')
    expect(loadChromeMinimized(() => ({ matches: false }))).toBe(false)
  })

  it('defaults to minimized on narrow viewports when no preference saved', () => {
    expect(isNarrowViewport(() => ({ matches: true }))).toBe(true)
    expect(loadChromeMinimized(() => ({ matches: true }))).toBe(true)
  })

  it('persists minimized preference over viewport default', () => {
    saveChromeMinimized(true)
    expect(localStorage.getItem(CHROME_MINIMIZED_KEY)).toBe('true')
    expect(loadChromeMinimized(() => ({ matches: false }))).toBe(true)
    saveChromeMinimized(false)
    expect(loadChromeMinimized(() => ({ matches: true }))).toBe(false)
  })

  it('exposes minimize/expand chrome panel styles', () => {
    const css = readFileSync(resolve(here, 'App.css'), 'utf8')
    expect(css).toMatch(/\.chrome-panel\s*\{/s)
    expect(css).toMatch(/\.chrome-panel--minimized\s*\{/s)
    expect(css).toMatch(/\.chrome-panel__toggle\s*\{/s)
  })
})

describe('REQ-UI-014 — Mobile layout keeps board visible', () => {
  it('compacts controls and reserves board min-height on narrow screens', () => {
    const css = readFileSync(resolve(here, 'App.css'), 'utf8')
    const mobile = css.match(/@media \(max-width:\s*720px\)\s*\{[\s\S]*$/)?.[0] ?? ''
    expect(mobile).toMatch(/\.brand\s*\{[^}]*position:\s*absolute/s)
    expect(mobile).toMatch(/\.topbar__row\s*\{[^}]*display:\s*flex/s)
    expect(mobile).toMatch(/\.view-switch--days\s*\{[^}]*display:\s*none/s)
    expect(mobile).toMatch(/\.board-shell[\s\S]*?min-height:\s*52dvh/s)
  })
})
