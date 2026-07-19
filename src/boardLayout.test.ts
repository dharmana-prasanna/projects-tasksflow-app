import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  boardColumns,
  clampColWidth,
  COL_WIDTH_ABS_MAX,
  COL_WIDTH_STORAGE_KEY,
  colMin,
  loadColWidthPrefs,
  resolveColWidth,
  saveColWidthPrefs,
  withColWidth,
} from './boardLayout'

const here = dirname(fileURLToPath(import.meta.url))

function readCss(name: string): string {
  return readFileSync(resolve(here, name), 'utf8')
}

describe('REQ-UI-008 — Sticky date header (column layout)', () => {
  it('colMin shrinks as day span grows', () => {
    expect(colMin(1)).toBe(112)
    expect(colMin(7)).toBe(88)
    expect(colMin(15)).toBe(72)
    expect(colMin(30)).toBe(64)
    expect(colMin(90)).toBe(52)
    expect(colMin(180)).toBe(44)
    expect(colMin(365)).toBe(36)
  })

  it('boardColumns keeps Time + fixed day tracks for header/body alignment', () => {
    expect(boardColumns(7)).toBe('4rem repeat(7, minmax(88px, 88px))')
    expect(boardColumns(1)).toBe('4rem repeat(1, minmax(112px, 112px))')
    expect(boardColumns(365)).toBe('4rem repeat(365, minmax(36px, 36px))')
  })

  it('header and body would share an identical column template for any span', () => {
    for (const n of [1, 3, 7, 10, 15, 30, 60, 90, 180, 365]) {
      const cols = boardColumns(n)
      expect(cols).toMatch(/^4rem repeat\(\d+, minmax\(\d+px, \d+px\)\)$/)
      expect(boardColumns(n)).toBe(cols)
    }
  })
})

describe('REQ-UI-008 — Sticky date header (CSS contract)', () => {
  const appCss = readCss('App.css')
  const indexCss = readCss('index.css')

  it('pins .board-header to the top of the board scroller', () => {
    expect(appCss).toMatch(/\.board-header\s*\{[^}]*position:\s*sticky/s)
    expect(appCss).toMatch(/\.board-header\s*\{[^}]*top:\s*0/s)
  })

  it('keeps the Time corner sticky on horizontal scroll', () => {
    expect(appCss).toMatch(/\.board__corner\s*\{[^}]*position:\s*sticky/s)
    expect(appCss).toMatch(/\.board__corner\s*\{[^}]*left:\s*0/s)
  })

  it('scrolls times inside the board, not the whole page', () => {
    expect(appCss).toMatch(/\.app\s*\{[^}]*height:\s*100svh/s)
    expect(appCss).toMatch(/\.app\s*\{[^}]*overflow:\s*hidden/s)
    expect(appCss).toMatch(/\.board-scroll\s*\{[^}]*overflow:\s*auto/s)
    expect(appCss).toMatch(/\.board-scroll\s*\{[^}]*min-height:\s*0/s)
    expect(indexCss).toMatch(/html,\s*body,\s*#root\s*\{[^}]*overflow:\s*hidden/s)
  })
})

describe('REQ-UI-014 — Mobile board scrolling', () => {
  const appCss = readCss('App.css')
  const gridSrc = readFileSync(resolve(here, 'components/CalendarGrid.tsx'), 'utf8')

  it('allows pan on both axes in the board scroller', () => {
    expect(appCss).toMatch(
      /\.board-scroll\s*\{[^}]*touch-action:\s*pan-x\s+pan-y/s,
    )
  })

  it('keeps board/graph flex children shrinkable on iOS (flex-basis 0)', () => {
    expect(appCss).toMatch(/\.board-shell\s*\{[^}]*flex:\s*1\s+1\s+0/s)
    expect(appCss).toMatch(/\.board-scroll\s*\{[^}]*flex:\s*1\s+1\s+0/s)
    expect(appCss).toMatch(/\.graph-view__scroll\s*\{[^}]*flex:\s*1\s+1\s+0/s)
  })

  it('does not set touch-action:none on idle task chips', () => {
    const taskBlock = appCss.match(/\.task\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(taskBlock).toMatch(/^\s*touch-action:\s*manipulation\s*;/m)
    expect(taskBlock).not.toMatch(/^\s*touch-action:\s*none\s*;/m)
    expect(appCss).toMatch(/\.task--dragging\s*\{[^}]*touch-action:\s*none/s)
  })

  it('uses TouchSensor delay so swipe can scroll before drag', () => {
    expect(gridSrc).toMatch(/TouchSensor/)
    expect(gridSrc).toMatch(/MouseSensor/)
    expect(gridSrc).toMatch(/delay:\s*220/)
  })

  it('reserves board space on narrow viewports', () => {
    const mobile = appCss.match(/@media \(max-width:\s*720px\)\s*\{[\s\S]*$/)?.[0] ?? ''
    expect(mobile).toMatch(/\.board-shell[\s\S]*?min-height:\s*42dvh/s)
    expect(mobile).toMatch(/\.topbar\s*\{[^}]*max-height:\s*34dvh/s)
  })
})

describe('REQ-UI-015 — Mobile modals fit the viewport', () => {
  const appCss = readCss('App.css')

  it('constrains modal width to the viewport', () => {
    expect(appCss).toMatch(/\.modal\s*\{[^}]*max-width:\s*100%/s)
    expect(appCss).toMatch(/\.modal\s*\{[^}]*width:\s*min\([^)]*100vw/s)
    expect(appCss).toMatch(
      /\.modal__form input[\s\S]*?min-width:\s*0/s,
    )
  })

  it('stacks modal rows on narrow screens', () => {
    const mobile = appCss.match(/@media \(max-width:\s*720px\)\s*\{[\s\S]*$/)?.[0] ?? ''
    expect(mobile).toMatch(/\.modal__row\s*\{[^}]*grid-template-columns:\s*1fr/s)
    expect(mobile).toMatch(/\.modal,\s*\n\s*\.modal--wide\s*\{[^}]*width:\s*100%/s)
  })
})

describe('REQ-UI-009 / REQ-LOCAL-004 — Resizable day columns', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('clamps width between span floor and absolute max', () => {
    expect(clampColWidth(7, 10)).toBe(colMin(7))
    expect(clampColWidth(7, 200)).toBe(200)
    expect(clampColWidth(7, 9999)).toBe(COL_WIDTH_ABS_MAX)
    expect(clampColWidth(365, 10)).toBe(36)
    expect(clampColWidth(365, 80)).toBe(80)
  })

  it('boardColumns uses the clamped manual width for all day tracks', () => {
    expect(boardColumns(7, 140)).toBe('4rem repeat(7, minmax(140px, 140px))')
    expect(boardColumns(7, 10)).toBe('4rem repeat(7, minmax(88px, 88px))')
  })

  it('resolveColWidth prefers saved prefs, else colMin', () => {
    expect(resolveColWidth(7, {})).toBe(88)
    expect(resolveColWidth(7, { '7': 160 })).toBe(160)
    expect(resolveColWidth(7, { '7': 5 })).toBe(88)
  })

  it('withColWidth writes a clamped preference for the day span', () => {
    expect(withColWidth({}, 7, 150)).toEqual({ '7': 150 })
    expect(withColWidth({ '7': 100 }, 15, 200)).toEqual({
      '7': 100,
      '15': 200,
    })
  })

  it('persists preferences under flowboard-day-col-widths', () => {
    expect(COL_WIDTH_STORAGE_KEY).toBe('flowboard-day-col-widths')
    saveColWidthPrefs({ '7': 160 })
    expect(localStorage.getItem(COL_WIDTH_STORAGE_KEY)).toContain('160')
    expect(loadColWidthPrefs()).toEqual({ '7': 160 })
  })

  it('exposes a column resize handle in CSS', () => {
    const appCss = readCss('App.css')
    expect(appCss).toMatch(/\.board__col-resize\s*\{[^}]*cursor:\s*col-resize/s)
  })
})
