export type MainView = 'board' | 'graph'

export const MAIN_VIEW_KEY = 'flowboard-main-view'

export function loadMainView(): MainView {
  try {
    const v = localStorage.getItem(MAIN_VIEW_KEY)
    return v === 'graph' ? 'graph' : 'board'
  } catch {
    return 'board'
  }
}

export function saveMainView(view: MainView): void {
  localStorage.setItem(MAIN_VIEW_KEY, view)
}
