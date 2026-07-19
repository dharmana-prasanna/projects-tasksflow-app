import type { StoreState } from '../types'
import { migrate } from './migrate'

export type SheetsResponse = {
  ok: boolean
  error?: string
  state?: unknown
  updatedAt?: string
  version?: number
  calendarSync?: boolean
  calendarError?: string
  calendar?: {
    synced?: boolean
    created?: number
    updated?: number
    deleted?: number
    skipped?: number
    calendarName?: string
    errors?: string[]
    error?: string
  }
}

export type SaveOptions = {
  syncCalendar?: boolean
}

/**
 * Talk to the Apps Script web app.
 * Content-Type text/plain avoids a CORS preflight.
 */
function parseResponseText(text: string): SheetsResponse {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Empty response from Apps Script.')
  try {
    return JSON.parse(trimmed) as SheetsResponse
  } catch {
    if (trimmed.includes('<!DOCTYPE') || trimmed.includes('<html')) {
      throw new Error(
        'Got an HTML page instead of JSON. Redeploy the web app (New version) and use the /exec URL.',
      )
    }
    throw new Error(
      'Sheets returned a non-JSON response. Redeploy Apps Script as a Web app (Anyone).',
    )
  }
}

async function request(
  scriptUrl: string,
  body: Record<string, unknown>,
): Promise<SheetsResponse> {
  let res: Response
  try {
    res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
    })
  } catch {
    throw new Error(
      'Network error talking to Apps Script. Check the /exec URL and that the deployment allows Anyone.',
    )
  }
  const text = await res.text()
  try {
    return parseResponseText(text)
  } catch (err) {
    // GET fallback when POST redirect strips the body
    if (body.action === 'load' || body.action === 'ping') {
      const url = new URL(scriptUrl)
      url.searchParams.set('action', String(body.action))
      const getRes = await fetch(url.toString(), { method: 'GET', redirect: 'follow' })
      return parseResponseText(await getRes.text())
    }
    throw err instanceof Error
      ? err
      : new Error('Sheets returned a non-JSON response.')
  }
}

export async function pingSheets(scriptUrl: string): Promise<void> {
  const data = await request(scriptUrl, { action: 'ping' })
  if (!data.ok) throw new Error(data.error || 'Ping failed')
}

export async function loadFromSheets(
  scriptUrl: string,
): Promise<{ state: StoreState; updatedAt: string }> {
  const data = await request(scriptUrl, { action: 'load' })
  if (!data.ok) throw new Error(data.error || 'Load failed')
  const state = migrate(data.state)
  if (!state) throw new Error('Sheets returned invalid board data.')
  return { state, updatedAt: data.updatedAt || new Date().toISOString() }
}

export async function saveToSheets(
  scriptUrl: string,
  state: StoreState,
  options: SaveOptions = {},
): Promise<{
  updatedAt: string
  calendar?: SheetsResponse['calendar']
  calendarError?: string
}> {
  const data = await request(scriptUrl, {
    action: 'save',
    state,
    syncCalendar: Boolean(options.syncCalendar),
  })
  if (!data.ok) throw new Error(data.error || 'Save failed')
  return {
    updatedAt: data.updatedAt || new Date().toISOString(),
    calendar: data.calendar,
    calendarError: data.calendarError || data.calendar?.error,
  }
}

export async function deleteInvalidTasksFromSheets(scriptUrl: string): Promise<{
  deleted: number
  titles: string[]
  message: string
}> {
  const data = await request(scriptUrl, { action: 'deleteInvalidTasks' })
  if (!data.ok) throw new Error(data.error || 'Cleanup failed')
  const deleted = Number((data as { deleted?: number }).deleted ?? 0)
  const titles = ((data as { titles?: string[] }).titles ?? []).map(String)
  const message =
    (data as { message?: string }).message ||
    (deleted ? `Deleted ${deleted} invalid task(s).` : 'No invalid tasks found.')
  return { deleted, titles, message }
}
