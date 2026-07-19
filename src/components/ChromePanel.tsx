import type { ReactNode } from 'react'

type Props = {
  minimized: boolean
  onToggle: () => void
  summary: string
  children: ReactNode
}

/** Collapsible projects / flows / hint chrome above the board. */
export function ChromePanel({ minimized, onToggle, summary, children }: Props) {
  return (
    <section
      className={`chrome-panel${minimized ? ' chrome-panel--minimized' : ''}`}
      aria-label="Projects and flows"
    >
      <div className="chrome-panel__toolbar">
        {minimized ? (
          <p className="chrome-panel__summary" title={summary}>
            {summary}
          </p>
        ) : (
          <span className="chrome-panel__title">Projects &amp; flows</span>
        )}
        <button
          type="button"
          className="btn btn--ghost chrome-panel__toggle"
          onClick={onToggle}
          aria-expanded={!minimized}
          aria-controls="chrome-panel-body"
          title={minimized ? 'Expand projects and flows' : 'Minimize projects and flows'}
        >
          {minimized ? 'Expand' : 'Minimize'}
        </button>
      </div>
      {!minimized && (
        <div id="chrome-panel-body" className="chrome-panel__body">
          {children}
        </div>
      )}
    </section>
  )
}
