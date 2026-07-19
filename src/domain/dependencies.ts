import type { Dependency } from '../types'

/** True if adding fromId→toId would create a cycle in the dependency graph. */
export function wouldCreateCycle(
  dependencies: Dependency[],
  fromId: string,
  toId: string,
): boolean {
  const adj = new Map<string, string[]>()
  for (const dep of dependencies) {
    const list = adj.get(dep.fromId) ?? []
    list.push(dep.toId)
    adj.set(dep.fromId, list)
  }
  const stack = [toId]
  const seen = new Set<string>()
  while (stack.length) {
    const node = stack.pop()!
    if (node === fromId) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of adj.get(node) ?? []) stack.push(next)
  }
  return false
}

export type AddDependencyResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Pure validation for a new dependency (does not mutate).
 * Callers still verify task/flow existence against store state.
 */
export function validateNewDependency(
  dependencies: Dependency[],
  fromId: string,
  toId: string,
  flowId: string,
): AddDependencyResult {
  if (fromId === toId) {
    return { ok: false, reason: 'A task cannot depend on itself.' }
  }
  if (!flowId) {
    return { ok: false, reason: 'Select a flow before linking tasks.' }
  }
  if (
    dependencies.some(
      (d) => d.fromId === fromId && d.toId === toId && d.flowId === flowId,
    )
  ) {
    return {
      ok: false,
      reason: 'That dependency already exists on this flow.',
    }
  }
  if (wouldCreateCycle(dependencies, fromId, toId)) {
    return { ok: false, reason: 'That link would create a cycle.' }
  }
  return { ok: true }
}

/** Task is "valid" for calendar/sheets if it has at least one YYYY-MM-DD segment date. */
export function taskHasValidScheduleDate(task: {
  segments?: { date?: string }[]
  date?: string
}): boolean {
  const segs = task.segments ?? []
  for (const s of segs) {
    if (s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date)) return true
  }
  return Boolean(task.date && /^\d{4}-\d{2}-\d{2}$/.test(task.date))
}
