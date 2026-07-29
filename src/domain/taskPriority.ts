import type { Task, TaskPriority } from '../types'

export type { TaskPriority }

/** Stored priority values (q4 kept for legacy Sheets rows). */
export const TASK_PRIORITIES = ['q1', 'q2', 'q3', 'q4'] as const

/** Compact UI choices: DoNow / Schedule / Delegate. */
export const UI_PRIORITIES = ['q1', 'q2', 'q3'] as const

/** Default for new / legacy tasks: Schedule. */
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'q2'

export type PriorityMeta = {
  id: TaskPriority
  /** Compact control / badge text */
  short: string
  /** Title / tooltip */
  hint: string
}

export const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  q1: {
    id: 'q1',
    short: 'DoNow',
    hint: 'Important & Urgent — do now',
  },
  q2: {
    id: 'q2',
    short: 'Schedule',
    hint: 'Important & Not urgent — schedule',
  },
  q3: {
    id: 'q3',
    short: 'Delegate',
    hint: 'Urgent but less important — delegate',
  },
  q4: {
    id: 'q4',
    short: 'Delegate',
    hint: 'Legacy eliminate — treated as Delegate',
  },
}

export function isTaskPriority(raw: unknown): raw is TaskPriority {
  return (
    typeof raw === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(raw)
  )
}

/**
 * Normalize unknown priority values.
 * Missing/invalid → Schedule (q2). Legacy q4 / eliminate → Delegate (q3).
 */
export function normalizePriority(raw: unknown): TaskPriority {
  if (typeof raw === 'number' && raw >= 1 && raw <= 3) {
    return TASK_PRIORITIES[raw - 1]
  }
  if (typeof raw === 'number' && raw === 4) return 'q3'
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '')
    if (key === 'q1' || key === '1' || key === 'do' || key === 'donow' || key === 'urgent')
      return 'q1'
    if (key === 'q2' || key === '2' || key === 'schedule') return 'q2'
    if (
      key === 'q3' ||
      key === '3' ||
      key === 'delegate' ||
      key === 'q4' ||
      key === '4' ||
      key === 'eliminate' ||
      key === 'drop'
    )
      return 'q3'
  }
  return DEFAULT_TASK_PRIORITY
}

/** Priority for UI controls (legacy q4 maps to Delegate). */
export function uiPriority(priority: TaskPriority): 'q1' | 'q2' | 'q3' {
  const p = normalizePriority(priority)
  return p === 'q4' ? 'q3' : p
}

export function priorityLabel(priority: TaskPriority): string {
  return PRIORITY_META[uiPriority(priority)].short
}

export function taskMatchesPriorityFilter(
  task: Pick<Task, 'priority'>,
  filter: TaskPriority | 'all',
): boolean {
  if (filter === 'all') return true
  return uiPriority(normalizePriority(task.priority)) === uiPriority(filter)
}

export function applyBulkPriority(
  tasks: Task[],
  priority: TaskPriority,
): Task[] {
  const next = uiPriority(normalizePriority(priority))
  return tasks.map((t) => ({ ...t, priority: next }))
}
