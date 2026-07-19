import { useEffect, useState } from 'react'
import type { SyncStatus } from '../hooks/useTaskStore'
import { getBuiltInSheetsUrl } from '../storage/localCache'

type Props = {
  sheetsUrl: string
  calendarSync: boolean
  syncStatus: SyncStatus
  syncError: string | null
  updatedAt: string
  onClose: () => void
  onConnect: (url: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  onDisconnect: () => void
  onSetCalendarSync: (
    enabled: boolean,
  ) => Promise<
    | { ok: true; detail?: string }
    | { ok: false; reason: string }
  >
  onPull: () => Promise<{ ok: true } | { ok: false; reason: string }>
  onPush: () => Promise<
    { ok: true; detail?: string } | { ok: false; reason: string }
  >
  onDeleteInvalidTasks: () => Promise<
    { ok: true; detail?: string } | { ok: false; reason: string }
  >
}

const STATUS_LABEL: Record<SyncStatus, string> = {
  'local-only': 'Local only (browser)',
  loading: 'Loading from Sheets…',
  saving: 'Saving…',
  synced: 'Synced with Sheets',
  error: 'Sync error',
  offline: 'Offline',
}

export function StorageModal({
  sheetsUrl,
  calendarSync,
  syncStatus,
  syncError,
  updatedAt,
  onClose,
  onConnect,
  onDisconnect,
  onSetCalendarSync,
  onPull,
  onPush,
  onDeleteInvalidTasks,
}: Props) {
  const [url, setUrl] = useState(sheetsUrl)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const builtInUrl = getBuiltInSheetsUrl()

  useEffect(() => {
    setUrl(sheetsUrl || builtInUrl)
  }, [sheetsUrl, builtInUrl])

  async function connect() {
    setBusy(true)
    setMessage(null)
    const result = await onConnect(url)
    setBusy(false)
    if (!result.ok) setMessage(result.reason)
    else setMessage(url.trim() ? 'Connected. Board will sync automatically.' : 'Disconnected.')
  }

  async function pull() {
    setBusy(true)
    setMessage(null)
    const result = await onPull()
    setBusy(false)
    setMessage(result.ok ? 'Pulled latest from Sheets.' : result.reason)
  }

  async function push() {
    setBusy(true)
    setMessage(null)
    const result = await onPush()
    setBusy(false)
    setMessage(result.ok ? (result.detail ?? 'Pushed board to Sheets.') : result.reason)
  }

  async function toggleCalendar(enabled: boolean) {
    setBusy(true)
    setMessage(null)
    const result = await onSetCalendarSync(enabled)
    setBusy(false)
    setMessage(result.ok ? (result.detail ?? 'Updated.') : result.reason)
  }

  async function cleanupInvalid() {
    if (
      !window.confirm(
        'Delete all tasks that have no valid date (the ones Calendar skips)? This cannot be undone.',
      )
    ) {
      return
    }
    setBusy(true)
    setMessage(null)
    const result = await onDeleteInvalidTasks()
    setBusy(false)
    setMessage(result.ok ? (result.detail ?? 'Cleanup done.') : result.reason)
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--wide"
        role="dialog"
        aria-labelledby="storage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id="storage-title">Cloud sync</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="storage-status">
          <span className={`sync-dot sync-dot--${syncStatus}`} aria-hidden="true" />
          {STATUS_LABEL[syncStatus]}
          {calendarSync ? ' · Calendar on' : ''}
          {updatedAt ? (
            <span className="storage-status__meta">
              · updated {new Date(updatedAt).toLocaleString()}
            </span>
          ) : null}
        </p>

        {syncError && (
          <p
            className={`storage-msg${
              syncStatus === 'error' || syncError.includes('Calendar issue')
                ? ' storage-msg--error'
                : ''
            }`}
            role="alert"
          >
            {syncError}
          </p>
        )}
        {message && (
          <p className="storage-msg">{message}</p>
        )}

        <div className="modal__form">
          <label>
            Apps Script web app URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {builtInUrl ? (
            <p className="modal__tip">
              This deploy includes a default Sheets URL from build settings
              (Netlify / <code>VITE_SHEETS_SCRIPT_URL</code>). You can still
              change it here, or Disconnect for local-only. Pull / Push stay
              available when connected.
            </p>
          ) : null}

          <label className="storage-check">
            <input
              type="checkbox"
              checked={calendarSync}
              disabled={busy || !sheetsUrl}
              onChange={(e) => void toggleCalendar(e.target.checked)}
            />
            <span>
              Sync tasks to <strong>Google Calendar</strong> (one event per day segment,
              using that day’s start/end). Add/edit/delete in Flowboard updates Calendar on
              save.
            </span>
          </label>

          <div className="modal__actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={connect}>
              {url.trim() ? 'Connect' : 'Use local only'}
            </button>
            {sheetsUrl ? (
              <>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={pull}>
                  Pull
                </button>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={push}>
                  Push
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={() => void cleanupInvalid()}
                  title="Remove tasks with no valid date (Calendar skips these)"
                >
                  Delete invalid tasks
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => {
                    onDisconnect()
                    setUrl('')
                    setMessage('Disconnected. Data stays in this browser.')
                  }}
                >
                  Disconnect
                </button>
              </>
            ) : null}
          </div>
        </div>

        <ol className="storage-steps">
          <li>Create a Google Sheet (blank is fine).</li>
          <li>
            Extensions → Apps Script → paste{' '}
            <code>google-apps-script/Code.gs</code> from this project.
          </li>
          <li>
            Deploy → New deployment → Web app → Execute as <strong>Me</strong>, access{' '}
            <strong>Anyone</strong>. After script updates: Deploy → Manage deployments →
            edit → <strong>New version</strong>. Then in Flowboard click <strong>Pull</strong>{' '}
            before Push if tasks look missing.
          </li>
          <li>Paste the <code>/exec</code> URL above, Connect, then enable Calendar sync.</li>
          <li>
            If a task is in Sheets but missing from Google Calendar: confirm Calendar sync is
            checked, Push, then open Google Calendar on that <strong>exact date (year
            2026)</strong> on your <strong>primary</strong> calendar. Or in Apps Script run{' '}
            <code>forceSyncCalendarFromSheet</code> and check View → Logs.
          </li>
          <li>
            If Calendar auth fails, run <code>authorizeCalendar</code> once and Allow access.
          </li>
          <li>
            If Google Calendar already has duplicates, run{' '}
            <code>cleanupDuplicateFlowboardEvents</code> in Apps Script, then Push.
          </li>
        </ol>
        <p className="storage-note">
          Sheets tabs: Projects, Flows, Tasks, Segments, Dependencies, CalendarMap, Meta.
          Browser keeps a local cache for fast loads.
        </p>
      </div>
    </div>
  )
}
