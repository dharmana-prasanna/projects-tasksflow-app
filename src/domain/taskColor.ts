/** Valid #RRGGBB task/project color, or undefined when unset/invalid. */
export function normalizeTaskColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const c = raw.trim()
  if (!/^#[0-9A-Fa-f]{6}$/.test(c)) return undefined
  return c
}

/** Chip color: optional task override, else project color. */
export function resolveTaskColor(
  task: { color?: string; projectId: string },
  projectColorFor: (projectId: string) => string,
): string {
  return normalizeTaskColor(task.color) ?? projectColorFor(task.projectId)
}
