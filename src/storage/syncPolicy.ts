import type { StoreState } from '../types'

/**
 * Auto-save must not wipe Sheets when the board is empty.
 * Explicit Push may pass allowEmptyBoard after user confirmation.
 */
export function shouldSkipEmptyAutoSave(
  taskCount: number,
  allowEmptyBoard = false,
): boolean {
  return taskCount === 0 && !allowEmptyBoard
}

/** Prefer browser state over a remote board that lost all schedules (post-redeploy). */
export function shouldPreferLocalOverRemote(
  remote: StoreState,
  local: StoreState,
): boolean {
  const remoteEmpty =
    remote.tasks.length === 0 &&
    remote.dependencies.length === 0 &&
    remote.projects.length === 0
  const remoteMissingSchedule =
    remote.tasks.length > 0 &&
    remote.tasks.every((t) => !t.segments || t.segments.length === 0)
  const localHasSchedule = local.tasks.some(
    (t) => Array.isArray(t.segments) && t.segments.length > 0,
  )
  const localHasData = local.tasks.length > 0 || local.dependencies.length > 0

  return (remoteEmpty && localHasData) || (remoteMissingSchedule && localHasSchedule)
}
