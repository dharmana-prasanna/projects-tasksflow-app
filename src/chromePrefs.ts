export const CHROME_MINIMIZED_KEY = 'flowboard-chrome-minimized'

/** Whether the projects/flows chrome panel starts minimized. */
export function loadChromeMinimized(): boolean {
  try {
    return localStorage.getItem(CHROME_MINIMIZED_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveChromeMinimized(minimized: boolean): void {
  localStorage.setItem(CHROME_MINIMIZED_KEY, minimized ? 'true' : 'false')
}
