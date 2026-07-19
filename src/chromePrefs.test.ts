import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CHROME_MINIMIZED_KEY,
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

  it('defaults to expanded (not minimized)', () => {
    expect(CHROME_MINIMIZED_KEY).toBe('flowboard-chrome-minimized')
    expect(loadChromeMinimized()).toBe(false)
  })

  it('persists minimized preference', () => {
    saveChromeMinimized(true)
    expect(localStorage.getItem(CHROME_MINIMIZED_KEY)).toBe('true')
    expect(loadChromeMinimized()).toBe(true)
    saveChromeMinimized(false)
    expect(loadChromeMinimized()).toBe(false)
  })

  it('exposes minimize/expand chrome panel styles', () => {
    const css = readFileSync(resolve(here, 'App.css'), 'utf8')
    expect(css).toMatch(/\.chrome-panel\s*\{/s)
    expect(css).toMatch(/\.chrome-panel--minimized\s*\{/s)
    expect(css).toMatch(/\.chrome-panel__toggle\s*\{/s)
  })
})
