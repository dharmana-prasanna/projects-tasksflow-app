import type { LabelDef } from '../types'

export const MAX_LABEL_LENGTH = 32
export const MAX_LABEL_DESCRIPTION_LENGTH = 160
export const MAX_LABELS_PER_TASK = 12

/** Trim / collapse spaces; empty → null; capped length. */
export function normalizeLabel(raw: string): string | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return null
  return s.slice(0, MAX_LABEL_LENGTH)
}

export function normalizeLabelDescription(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LABEL_DESCRIPTION_LENGTH)
}

/** Normalize one catalog entry (string or `{ name, description }`). */
export function normalizeLabelDef(raw: unknown): LabelDef | null {
  if (typeof raw === 'string') {
    const name = normalizeLabel(raw)
    return name ? { name, description: '' } : null
  }
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { name?: unknown; description?: unknown }
  const name = normalizeLabel(String(obj.name ?? ''))
  if (!name) return null
  return { name, description: normalizeLabelDescription(obj.description) }
}

/**
 * Normalize a labels list (array or comma/semicolon string).
 * Dedupes case-insensitively (keeps first spelling), sorted A–Z.
 */
export function normalizeLabels(raw: unknown): string[] {
  let parts: string[] = []
  if (Array.isArray(raw)) {
    parts = raw.map((x) => {
      if (typeof x === 'string') return x
      if (x && typeof x === 'object' && 'name' in x) {
        return String((x as { name: unknown }).name ?? '')
      }
      return String(x)
    })
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

/** Normalize catalog entries; prefer non-empty description on conflict. */
export function normalizeLabelDefs(raw: unknown): LabelDef[] {
  if (!Array.isArray(raw)) return []
  const seen = new Map<string, LabelDef>()
  for (const item of raw) {
    const def = normalizeLabelDef(item)
    if (!def) continue
    const key = def.name.toLowerCase()
    const prev = seen.get(key)
    if (!prev) {
      seen.set(key, def)
      continue
    }
    if (!prev.description && def.description) {
      seen.set(key, { name: prev.name, description: def.description })
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Parse a free-text labels field (comma / semicolon separated). */
export function parseLabelsInput(text: string): string[] {
  return normalizeLabels(text)
}

/** Unique label names across tasks. */
export function collectAllLabels(
  tasks: { labels?: string[] }[],
): string[] {
  return normalizeLabels(tasks.flatMap((t) => t.labels ?? []))
}

export function labelNames(catalog: LabelDef[] | undefined): string[] {
  return (catalog ?? []).map((l) => l.name)
}

export function getLabelDescription(
  catalog: LabelDef[] | undefined,
  label: string,
): string {
  const key = normalizeLabel(label)?.toLowerCase()
  if (!key) return ''
  return (
    (catalog ?? []).find((l) => l.name.toLowerCase() === key)?.description ?? ''
  )
}

/** Tooltip text: description when set, otherwise a short usage hint. */
export function labelTooltip(
  catalog: LabelDef[] | undefined,
  label: string,
  taskCount: number,
): string {
  const description = getLabelDescription(catalog, label)
  if (description) return description
  if (taskCount === 0) return `${label} (unused — safe to delete)`
  return `Show ${taskCount} task${taskCount === 1 ? '' : 's'} with “${label}”`
}

/** Union of catalog + labels currently on tasks (keeps descriptions). */
export function mergeLabelCatalog(
  catalog: Array<LabelDef | string> | undefined,
  tasks: { labels?: string[] }[],
): LabelDef[] {
  return normalizeLabelDefs([
    ...(catalog ?? []),
    ...tasks.flatMap((t) =>
      (t.labels ?? []).map((name) => ({ name, description: '' })),
    ),
  ])
}

/** Insert or update a catalog entry (keeps prior description if omitted). */
export function upsertLabelDef(
  catalog: LabelDef[] | undefined,
  label: string,
  description?: string,
): LabelDef[] {
  const name = normalizeLabel(label)
  if (!name) return normalizeLabelDefs(catalog)
  const key = name.toLowerCase()
  const prev = (catalog ?? []).find((l) => l.name.toLowerCase() === key)
  const nextDesc =
    description !== undefined
      ? normalizeLabelDescription(description)
      : (prev?.description ?? '')
  return normalizeLabelDefs([
    ...(catalog ?? []).filter((l) => l.name.toLowerCase() !== key),
    { name: prev?.name ?? name, description: nextDesc },
  ])
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
  catalog: LabelDef[] | undefined,
  label: string,
): LabelDef[] {
  const key = normalizeLabel(label)?.toLowerCase()
  if (!key) return normalizeLabelDefs(catalog)
  return normalizeLabelDefs(
    (catalog ?? []).filter((l) => l.name.toLowerCase() !== key),
  )
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

/** Select exactly one label for filtering (replaces prior selection). */
export function selectLabelFilter(label: string): string[] {
  const normalized = normalizeLabel(label)
  return normalized ? [normalized] : []
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
