import { useCallback, useEffect, useRef, useState } from 'react'
import { FLOW_COLORS, SAMPLE_STATE } from '../data/sample'
import {
  clearLocalCache,
  getCalendarSync,
  getLocalUpdatedAt,
  getSheetsUrl,
  loadLocalState,
  saveLocalState,
  setCalendarSync as persistCalendarSync,
  setSheetsUrl as persistSheetsUrl,
} from '../storage/localCache'
import {
  deleteInvalidTasksFromSheets,
  loadFromSheets,
  pingSheets,
  saveToSheets,
} from '../storage/sheetsBackend'
import { validateNewDependency } from '../domain/dependencies'
import {
  shouldPreferLocalOverRemote,
  shouldSkipEmptyAutoSave,
} from '../storage/syncPolicy'
import {
  canDeleteLabel,
  countTasksWithLabel,
  mergeLabelCatalog,
  normalizeLabel,
  removeFromLabelCatalog,
  upsertLabelDef,
} from '../domain/taskLabels'
import type { Dependency, Flow, LabelDef, Project, StoreState, Task } from '../types'

export type SyncStatus =
  | 'local-only'
  | 'loading'
  | 'synced'
  | 'saving'
  | 'error'
  | 'offline'

export function useTaskStore() {
  const [state, setState] = useState<StoreState>(loadLocalState)
  const [sheetsUrl, setSheetsUrlState] = useState(() => getSheetsUrl())
  const [calendarSync, setCalendarSyncState] = useState(() => getCalendarSync())
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    getSheetsUrl() ? 'loading' : 'local-only',
  )
  const [syncError, setSyncError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState(() => getLocalUpdatedAt())
  const skipNextRemoteSave = useRef(true)
  const saveTimer = useRef<number | null>(null)
  const saveInFlight = useRef(false)
  const saveQueued = useRef(false)
  const stateRef = useRef(state)
  const calendarSyncRef = useRef(calendarSync)
  const sheetsUrlRef = useRef(sheetsUrl)
  stateRef.current = state
  calendarSyncRef.current = calendarSync
  sheetsUrlRef.current = sheetsUrl

  const flushRemoteSave = useCallback(
    async (options: { allowEmptyBoard?: boolean } = {}) => {
      const url = sheetsUrlRef.current
      if (!url) return
      const snapshot = stateRef.current
      // Auto-save must not wipe Sheets when the board was cleared locally.
      // Explicit Push can pass allowEmptyBoard after user confirmation.
      if (
        shouldSkipEmptyAutoSave(
          snapshot.tasks.length,
          Boolean(options.allowEmptyBoard),
        )
      ) {
        setSyncStatus('synced')
        setSyncError(
          'Board is empty. Open Sheets → Push and confirm to clear the cloud board, or Pull to restore.',
        )
        return
      }
      if (saveInFlight.current) {
        saveQueued.current = true
        return
      }
      saveInFlight.current = true
      setSyncStatus('saving')
      setSyncError(null)
      try {
        let calendarWarning: string | undefined
        let calendarInfo: string | undefined
        do {
          saveQueued.current = false
          const result = await saveToSheets(url, stateRef.current, {
            syncCalendar: calendarSyncRef.current,
            allowEmptyBoard: options.allowEmptyBoard,
          })
          setUpdatedAt(result.updatedAt)
          calendarWarning = result.calendarError
          const cal = result.calendar
          if (cal && (cal.created || cal.updated || cal.synced)) {
            const name = (cal as { calendarName?: string }).calendarName
            calendarInfo = `Calendar${name ? ` (${name})` : ''}: +${cal.created ?? 0} / ~${cal.updated ?? 0} / −${cal.deleted ?? 0}. Check the event date in Google Calendar (e.g. Jul 21, 2026).`
          }
        } while (saveQueued.current)
        if (calendarWarning) {
          setSyncStatus('synced')
          setSyncError(`Sheets saved. Calendar issue: ${calendarWarning}`)
        } else if (calendarInfo) {
          setSyncStatus('synced')
          setSyncError(calendarInfo)
        } else {
          setSyncStatus('synced')
          setSyncError(null)
        }
      } catch (err: unknown) {
        setSyncStatus('error')
        setSyncError(err instanceof Error ? err.message : String(err))
      } finally {
        saveInFlight.current = false
      }
    },
    [],
  )

  // Cache every change locally
  useEffect(() => {
    saveLocalState(state, updatedAt || undefined)
  }, [state, updatedAt])

  // Initial pull from Sheets when configured
  useEffect(() => {
    if (!sheetsUrl) {
      setSyncStatus('local-only')
      return
    }

    let cancelled = false
    setSyncStatus('loading')
    setSyncError(null)

    loadFromSheets(sheetsUrl)
      .then(({ state: remote, updatedAt: remoteAt }) => {
        if (cancelled) return
        const localAt = getLocalUpdatedAt()
        const local = loadLocalState()
        // After schema redeploys, Sheets can look "empty of schedule" while
        // the browser still has good task times — keep local and Push.
        const preferLocal = shouldPreferLocalOverRemote(remote, local)

        if (preferLocal) {
          skipNextRemoteSave.current = true
          setSyncStatus('synced')
          void flushRemoteSave()
          return
        }

        if (!localAt || !remoteAt || remoteAt >= localAt) {
          skipNextRemoteSave.current = true
          setState(remote)
          setUpdatedAt(remoteAt)
        }
        setSyncStatus('synced')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSyncStatus('error')
        setSyncError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [sheetsUrl, flushRemoteSave])

  // Debounced push to Sheets (calendarSync read from ref — avoid double-save on toggle)
  useEffect(() => {
    if (!sheetsUrl) return
    if (skipNextRemoteSave.current) {
      skipNextRemoteSave.current = false
      return
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)

    saveTimer.current = window.setTimeout(() => {
      void flushRemoteSave()
    }, 900)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [state, sheetsUrl, flushRemoteSave])

  const connectSheets = useCallback(async (url: string) => {
    const trimmed = url.trim()
    if (!trimmed) {
      persistSheetsUrl('')
      setSheetsUrlState('')
      setSyncStatus('local-only')
      setSyncError(null)
      return { ok: true as const }
    }
    try {
      await pingSheets(trimmed)
      persistSheetsUrl(trimmed)
      setSheetsUrlState(trimmed)
      setSyncError(null)
      return { ok: true as const }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSyncError(message)
      return { ok: false as const, reason: message }
    }
  }, [])

  const disconnectSheets = useCallback(() => {
    persistSheetsUrl('')
    setSheetsUrlState('')
    setSyncStatus('local-only')
    setSyncError(null)
  }, [])

  const setCalendarSync = useCallback(
    async (enabled: boolean) => {
      persistCalendarSync(enabled)
      calendarSyncRef.current = enabled
      setCalendarSyncState(enabled)
      if (!sheetsUrl) {
        return {
          ok: false as const,
          reason: 'Connect Sheets first — Calendar sync runs through the same Apps Script.',
        }
      }
      try {
        await flushRemoteSave()
        return {
          ok: true as const,
          detail: enabled
            ? 'Calendar sync enabled. Existing duplicates are cleaned on save.'
            : 'Calendar sync off. Existing events were left in Google Calendar.',
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false as const, reason: message }
      }
    },
    [sheetsUrl, flushRemoteSave],
  )

  const pullFromSheets = useCallback(async () => {
    if (!sheetsUrl) return { ok: false as const, reason: 'No Sheets URL configured.' }
    setSyncStatus('loading')
    setSyncError(null)
    try {
      const { state: remote, updatedAt: remoteAt } = await loadFromSheets(sheetsUrl)
      skipNextRemoteSave.current = true
      setState(remote)
      setUpdatedAt(remoteAt)
      setSyncStatus('synced')
      return { ok: true as const }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSyncStatus('error')
      setSyncError(message)
      return { ok: false as const, reason: message }
    }
  }, [sheetsUrl])

  const pushToSheets = useCallback(
    async (options: { allowEmptyBoard?: boolean } = {}) => {
      if (!sheetsUrl) {
        return { ok: false as const, reason: 'No Sheets URL configured.' }
      }
      try {
        const empty = stateRef.current.tasks.length === 0
        if (empty && !options.allowEmptyBoard) {
          return {
            ok: false as const,
            reason:
              'Board is empty. Confirm clearing the cloud board when prompted, or Pull to restore.',
          }
        }
        await flushRemoteSave({
          allowEmptyBoard: empty && Boolean(options.allowEmptyBoard),
        })
        return {
          ok: true as const,
          detail: calendarSyncRef.current
            ? 'Saved to Sheets and Calendar (duplicates cleaned).'
            : 'Saved to Sheets.',
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false as const, reason: message }
      }
    },
    [sheetsUrl, flushRemoteSave],
  )

  const deleteInvalidTasks = useCallback(async () => {
    if (!sheetsUrl) {
      return { ok: false as const, reason: 'No Sheets URL configured.' }
    }
    setSyncStatus('saving')
    setSyncError(null)
    try {
      const result = await deleteInvalidTasksFromSheets(sheetsUrl)
      const { state: remote, updatedAt: remoteAt } = await loadFromSheets(sheetsUrl)
      skipNextRemoteSave.current = true
      setState(remote)
      setUpdatedAt(remoteAt)
      setSyncStatus('synced')
      return {
        ok: true as const,
        detail:
          result.deleted > 0
            ? `${result.message} Removed: ${result.titles.join(', ')}.`
            : result.message,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSyncStatus('error')
      setSyncError(message)
      return { ok: false as const, reason: message }
    }
  }, [sheetsUrl])

  const upsertProject = useCallback((project: Project) => {
    setState((prev) => {
      const exists = prev.projects.some((p) => p.id === project.id)
      if (exists) {
        return {
          ...prev,
          projects: prev.projects.map((p) => (p.id === project.id ? project : p)),
        }
      }
      const defaultFlow: Flow = {
        id: crypto.randomUUID(),
        name: 'Main flow',
        color: FLOW_COLORS[prev.flows.length % FLOW_COLORS.length],
        projectId: project.id,
      }
      return {
        ...prev,
        projects: [...prev.projects, project],
        flows: [...prev.flows, defaultFlow],
      }
    })
  }, [])

  const deleteProject = useCallback(
    (projectId: string): { ok: true } | { ok: false; reason: string } => {
      let result: { ok: true } | { ok: false; reason: string } = { ok: true }
      setState((prev) => {
        if (prev.projects.length <= 1) {
          result = { ok: false, reason: 'Keep at least one project.' }
          return prev
        }
        const fallback = prev.projects.find((p) => p.id !== projectId)
        if (!fallback) {
          result = { ok: false, reason: 'Keep at least one project.' }
          return prev
        }
        const fallbackFlow =
          prev.flows.find((f) => f.projectId === fallback.id) ?? prev.flows[0]
        const removedFlowIds = new Set(
          prev.flows.filter((f) => f.projectId === projectId).map((f) => f.id),
        )
        return {
          ...prev,
          projects: prev.projects.filter((p) => p.id !== projectId),
          flows: prev.flows.filter((f) => f.projectId !== projectId),
          tasks: prev.tasks.map((t) =>
            t.projectId === projectId ? { ...t, projectId: fallback.id } : t,
          ),
          dependencies: prev.dependencies.map((d) =>
            removedFlowIds.has(d.flowId)
              ? { ...d, flowId: fallbackFlow.id }
              : d,
          ),
        }
      })
      return result
    },
    [],
  )

  const upsertFlow = useCallback((flow: Flow) => {
    setState((prev) => {
      const exists = prev.flows.some((f) => f.id === flow.id)
      return {
        ...prev,
        flows: exists
          ? prev.flows.map((f) => (f.id === flow.id ? flow : f))
          : [...prev.flows, flow],
      }
    })
  }, [])

  const deleteFlow = useCallback(
    (flowId: string): { ok: true } | { ok: false; reason: string } => {
      let result: { ok: true } | { ok: false; reason: string } = { ok: true }
      setState((prev) => {
        const flow = prev.flows.find((f) => f.id === flowId)
        if (!flow) {
          result = { ok: false, reason: 'Flow not found.' }
          return prev
        }
        const siblings = prev.flows.filter((f) => f.projectId === flow.projectId)
        if (siblings.length <= 1) {
          result = { ok: false, reason: 'Keep at least one flow per project.' }
          return prev
        }
        const fallback = siblings.find((f) => f.id !== flowId)!
        return {
          ...prev,
          flows: prev.flows.filter((f) => f.id !== flowId),
          dependencies: prev.dependencies.map((d) =>
            d.flowId === flowId ? { ...d, flowId: fallback.id } : d,
          ),
        }
      })
      return result
    },
    [],
  )

  const upsertTask = useCallback((task: Task) => {
    setState((prev) => {
      const exists = prev.tasks.some((t) => t.id === task.id)
      const tasks = exists
        ? prev.tasks.map((t) => (t.id === task.id ? task : t))
        : [...prev.tasks, task]
      return {
        ...prev,
        tasks,
        labels: mergeLabelCatalog(prev.labels, tasks),
      }
    })
  }, [])

  const deleteTask = useCallback((taskId: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
      dependencies: prev.dependencies.filter(
        (d) => d.fromId !== taskId && d.toId !== taskId,
      ),
    }))
  }, [])

  const registerLabels = useCallback((defs: LabelDef[]) => {
    if (defs.length === 0) return
    setState((prev) => {
      let labels = prev.labels
      for (const def of defs) {
        labels = upsertLabelDef(labels, def.name, def.description)
      }
      return { ...prev, labels: mergeLabelCatalog(labels, prev.tasks) }
    })
  }, [])

  const deleteLabel = useCallback(
    (
      label: string,
    ): { ok: true } | { ok: false; reason: string; count: number } => {
      const normalized = normalizeLabel(label)
      if (!normalized) {
        return { ok: false, reason: 'Invalid label.', count: 0 }
      }
      let result: { ok: true } | { ok: false; reason: string; count: number } = {
        ok: true,
      }
      setState((prev) => {
        const count = countTasksWithLabel(prev.tasks, normalized)
        if (!canDeleteLabel(prev.tasks, normalized)) {
          result = {
            ok: false,
            count,
            reason: `Cannot delete “${normalized}” — ${count} task${count === 1 ? '' : 's'} still use it. Click the label to see them.`,
          }
          return prev
        }
        return {
          ...prev,
          labels: removeFromLabelCatalog(prev.labels, normalized),
        }
      })
      return result
    },
    [],
  )

  const addDependency = useCallback(
    (
      fromId: string,
      toId: string,
      flowId: string,
    ): { ok: true } | { ok: false; reason: string } => {
      if (fromId === toId) {
        return { ok: false, reason: 'A task cannot depend on itself.' }
      }
      if (!flowId) {
        return { ok: false, reason: 'Select a flow before linking tasks.' }
      }

      let result: { ok: true } | { ok: false; reason: string } = { ok: true }
      const dep: Dependency = {
        id: crypto.randomUUID(),
        fromId,
        toId,
        flowId,
      }

      setState((prev) => {
        const from = prev.tasks.find((t) => t.id === fromId)
        const to = prev.tasks.find((t) => t.id === toId)
        const flow = prev.flows.find((f) => f.id === flowId)
        if (!from || !to || !flow) {
          result = { ok: false, reason: 'Task or flow not found.' }
          return prev
        }
        const validation = validateNewDependency(
          prev.dependencies,
          fromId,
          toId,
          flowId,
        )
        if (!validation.ok) {
          result = validation
          return prev
        }
        return { ...prev, dependencies: [...prev.dependencies, dep] }
      })

      return result
    },
    [],
  )

  const removeDependency = useCallback((dependencyId: string) => {
    setState((prev) => ({
      ...prev,
      dependencies: prev.dependencies.filter((d) => d.id !== dependencyId),
    }))
  }, [])

  const resetSample = useCallback(() => {
    const fresh = structuredClone(SAMPLE_STATE)
    clearLocalCache()
    skipNextRemoteSave.current = false
    setState(fresh)
    setUpdatedAt(new Date().toISOString())
  }, [])

  return {
    projects: state.projects,
    flows: state.flows,
    tasks: state.tasks,
    dependencies: state.dependencies,
    labels: state.labels,
    upsertProject,
    deleteProject,
    upsertFlow,
    deleteFlow,
    upsertTask,
    deleteTask,
    registerLabels,
    deleteLabel,
    addDependency,
    removeDependency,
    resetSample,
    sheetsUrl,
    calendarSync,
    syncStatus,
    syncError,
    updatedAt,
    connectSheets,
    disconnectSheets,
    setCalendarSync,
    pullFromSheets,
    pushToSheets,
    deleteInvalidTasks,
  }
}
