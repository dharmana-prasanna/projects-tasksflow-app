import type { Dependency, Task } from '../types'

/** Other tasks that can be linked as dependents of `fromId`. */
export function eligibleDependentTasks(
  tasks: Task[],
  fromId: string | undefined,
): Task[] {
  return tasks
    .filter((t) => t.id !== fromId)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}

/**
 * Filter eligible dependents by a case-insensitive substring of the title.
 * Empty / whitespace query returns the list unchanged (still sorted).
 */
export function filterDependentTasks(
  tasks: Task[],
  query: string,
): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return tasks
  return tasks.filter((t) => t.title.toLowerCase().includes(q))
}

/** Task ids already linked as dependents of `fromId` on `flowId`. */
export function currentDependentIds(
  dependencies: Dependency[],
  fromId: string,
  flowId: string,
): string[] {
  return dependencies
    .filter((d) => d.fromId === fromId && d.flowId === flowId)
    .map((d) => d.toId)
}

export type DependencySyncPlan = {
  /** toIds that need a new from→to edge on the flow */
  toAdd: string[]
  /** dependency row ids to remove */
  toRemoveIds: string[]
}

/**
 * Diff selected dependents against existing edges on one flow.
 * Selection is the desired set of toIds for fromId → toId on flowId.
 */
export function planDependentSync(
  fromId: string,
  flowId: string,
  selectedToIds: string[],
  dependencies: Dependency[],
): DependencySyncPlan {
  const desired = new Set(selectedToIds.filter((id) => id && id !== fromId))
  const onFlow = dependencies.filter(
    (d) => d.fromId === fromId && d.flowId === flowId,
  )
  const existingTo = new Set(onFlow.map((d) => d.toId))

  const toAdd = [...desired].filter((id) => !existingTo.has(id)).sort()
  const toRemoveIds = onFlow
    .filter((d) => !desired.has(d.toId))
    .map((d) => d.id)
    .sort()

  return { toAdd, toRemoveIds }
}

export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id].sort()
}
