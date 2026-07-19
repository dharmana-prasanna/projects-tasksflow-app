/** Absolute ceiling for manual day-column resize (px). Floor is `colMin(dayCount)`. */
export const COL_WIDTH_ABS_MAX = 360

export const COL_WIDTH_STORAGE_KEY = 'flowboard-day-col-widths'

/** Default day-column width (px) for a given visible day count. */
export function colMin(dayCount: number): number {
  if (dayCount <= 1) return 112
  if (dayCount <= 7) return 88
  if (dayCount <= 15) return 72
  if (dayCount <= 30) return 64
  if (dayCount <= 90) return 52
  if (dayCount <= 180) return 44
  return 36
}

/** Clamp a proposed width for the current day span. */
export function clampColWidth(dayCount: number, width: number): number {
  const floor = colMin(dayCount)
  const n = Number.isFinite(width) ? Math.round(width) : floor
  return Math.min(COL_WIDTH_ABS_MAX, Math.max(floor, n))
}

/**
 * Shared CSS grid-template-columns for sticky date header + time body.
 * All day columns share one width so header/body stay aligned.
 */
export function boardColumns(dayCount: number, dayWidth?: number): string {
  const w = clampColWidth(dayCount, dayWidth ?? colMin(dayCount))
  return `4rem repeat(${dayCount}, minmax(${w}px, ${w}px))`
}

export type ColWidthPrefs = Record<string, number>

export function loadColWidthPrefs(): ColWidthPrefs {
  try {
    const raw = localStorage.getItem(COL_WIDTH_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: ColWidthPrefs = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveColWidthPrefs(prefs: ColWidthPrefs): void {
  localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(prefs))
}

/** Resolve width for a day span: saved preference, else default `colMin`. */
export function resolveColWidth(
  dayCount: number,
  prefs: ColWidthPrefs = {},
): number {
  const saved = prefs[String(dayCount)]
  if (saved == null) return colMin(dayCount)
  return clampColWidth(dayCount, saved)
}

export function withColWidth(
  prefs: ColWidthPrefs,
  dayCount: number,
  width: number,
): ColWidthPrefs {
  return {
    ...prefs,
    [String(dayCount)]: clampColWidth(dayCount, width),
  }
}
