import type { StoreState } from '../types'

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
