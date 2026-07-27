export const MAX_LABEL_LENGTH = 32
export const MAX_LABELS_PER_TASK = 12

/** Trim / collapse spaces; empty → null; capped length. */
export function normalizeLabel(raw: string): string | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return null
  return s.slice(0, MAX_LABEL_LENGTH)
}

/**
 * Normalize a labels list (array or comma/semicolon string).
 * Dedupes case-insensitively (keeps first spelling), sorted A–Z.
 */
export function normalizeLabels(raw: unknown): string[] {
  let parts: string[] = []
  if (Array.isArray(raw)) {
    parts = raw.map((x) => String(x))
  } else if (typeof raw === 'string') {
    parts = raw.split(/[,;]/)
  } else {
    return []
  }

  const seen = new Map<string, string>()
  for (const part of parts) {
    const label = normalizeLabel(part)
    if (!label) continue
    const key = label.toLowerCase()
    if (!seen.has(key)) seen.set(key, label)
    if (seen.size >= MAX_LABELS_PER_TASK) break
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** Parse a free-text labels field (comma / semicolon separated). */
export function parseLabelsInput(text: string): string[] {
  return normalizeLabels(text)
}

/** Unique labels across tasks for filter chips. */
export function collectAllLabels(
  tasks: { labels?: string[] }[],
): string[] {
  return normalizeLabels(tasks.flatMap((t) => t.labels ?? []))
}

/** Union of catalog + labels currently on tasks. */
export function mergeLabelCatalog(
  catalog: string[] | undefined,
  tasks: { labels?: string[] }[],
): string[] {
  return normalizeLabels([...(catalog ?? []), ...tasks.flatMap((t) => t.labels ?? [])])
}

/** How many tasks carry this label (case-insensitive). */
export function countTasksWithLabel(
  tasks: { labels?: string[] }[],
  label: string,
): number {
  const key = normalizeLabel(label)?.toLowerCase()
  if (!key) return 0
  return tasks.filter((t) =>
    (t.labels ?? []).some((l) => normalizeLabel(l)?.toLowerCase() === key),
  ).length
}

/** A catalog label may be deleted only when no task still uses it. */
export function canDeleteLabel(
  tasks: { labels?: string[] }[],
  label: string,
): boolean {
  return countTasksWithLabel(tasks, label) === 0
}

/** Remove one name from the catalog (no-op if missing). */
export function removeFromLabelCatalog(
  catalog: string[],
  label: string,
): string[] {
  const key = normalizeLabel(label)?.toLowerCase()
  if (!key) return normalizeLabels(catalog)
  return normalizeLabels(catalog.filter((l) => l.toLowerCase() !== key))
}

/**
 * Filter: empty `selected` → all tasks pass.
 * Otherwise task must include **any** selected label (OR, case-insensitive).
 */
export function taskMatchesLabelFilter(
  task: { labels?: string[] },
  selected: string[],
): boolean {
  if (selected.length === 0) return true
  const have = new Set(
    (task.labels ?? [])
      .map((l) => normalizeLabel(l)?.toLowerCase())
      .filter((x): x is string => Boolean(x)),
  )
  return selected.some((s) => {
    const key = normalizeLabel(s)?.toLowerCase()
    return Boolean(key && have.has(key))
  })
}

/** Toggle a label in a multi-select filter list. */
export function toggleLabelFilter(
  selected: string[],
  label: string,
): string[] {
  const normalized = normalizeLabel(label)
  if (!normalized) return selected
  const key = normalized.toLowerCase()
  const exists = selected.some((s) => s.toLowerCase() === key)
  if (exists) {
    return selected.filter((s) => s.toLowerCase() !== key)
  }
  return normalizeLabels([...selected, normalized])
}

/** Add one label to a task’s list (idempotent). */
export function addTaskLabel(labels: string[], label: string): string[] {
  return normalizeLabels([...labels, label])
}

/** Remove one label from a task’s list. */
export function removeTaskLabel(labels: string[], label: string): string[] {
  const key = normalizeLabel(label)?.toLowerCase()
  if (!key) return normalizeLabels(labels)
  return normalizeLabels(labels.filter((l) => l.toLowerCase() !== key))
}
