export const CHROME_MINIMIZED_KEY = 'flowboard-chrome-minimized'

const NARROW_QUERY = '(max-width: 720px)'

/** True when viewport is phone-sized (board must keep visible space). */
export function isNarrowViewport(
  matchMedia: (query: string) => { matches: boolean } = (q) =>
    typeof window !== 'undefined'
      ? window.matchMedia(q)
      : { matches: false },
): boolean {
  try {
    return matchMedia(NARROW_QUERY).matches
  } catch {
    return false
  }
}

/**
 * Whether the projects/flows chrome panel starts minimized.
 * Saved preference wins; if unset, narrow viewports default to minimized
 * so the calendar board is not crushed to zero height on phones.
 */
export function loadChromeMinimized(
  matchMedia?: (query: string) => { matches: boolean },
): boolean {
  try {
    const raw = localStorage.getItem(CHROME_MINIMIZED_KEY)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return isNarrowViewport(matchMedia ?? undefined)
  } catch {
    return false
  }
}

export function saveChromeMinimized(minimized: boolean): void {
  localStorage.setItem(CHROME_MINIMIZED_KEY, minimized ? 'true' : 'false')
}

export const BACKLOG_HIDDEN_KEY = 'flowboard-backlog-hidden'

/** Whether the right-side backlog rail is collapsed. Default: visible. */
export function loadBacklogHidden(): boolean {
  try {
    return localStorage.getItem(BACKLOG_HIDDEN_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveBacklogHidden(hidden: boolean): void {
  localStorage.setItem(BACKLOG_HIDDEN_KEY, hidden ? 'true' : 'false')
}
