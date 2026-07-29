import type { Task, TaskPriority } from '../types'

/** Eisenhower Matrix quadrants (priority levels). */
export const TASK_PRIORITIES = ['q1', 'q2', 'q3', 'q4'] as const

/** Default for new / legacy tasks: Important & Not Urgent (Schedule). */
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'q2'

export type PriorityMeta = {
  id: TaskPriority
  /** Short chip text */
  short: string
  /** Action name */
  label: string
  /** Important/Urgent summary */
  hint: string
}

export const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  q1: {
    id: 'q1',
    short: 'Q1',
    label: 'Do',
    hint: 'Important & Urgent',
  },
  q2: {
    id: 'q2',
    short: 'Q2',
    label: 'Schedule',
    hint: 'Important & Not urgent',
  },
  q3: {
    id: 'q3',
    short: 'Q3',
    label: 'Delegate',
    hint: 'Not important & Urgent',
  },
  q4: {
    id: 'q4',
    short: 'Q4',
    label: 'Eliminate',
    hint: 'Not important & Not urgent',
  },
}

export function isTaskPriority(raw: unknown): raw is TaskPriority {
  return (
    typeof raw === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(raw)
  )
}

/** Normalize unknown priority values; missing/invalid → default Q2. */
export function normalizePriority(raw: unknown): TaskPriority {
  if (typeof raw === 'number' && raw >= 1 && raw <= 4) {
    return TASK_PRIORITIES[raw - 1]
  }
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase()
    if (isTaskPriority(key)) return key
    // Accept friendly aliases
    if (key === '1' || key === 'do' || key === 'urgent') return 'q1'
    if (key === '2' || key === 'schedule') return 'q2'
    if (key === '3' || key === 'delegate') return 'q3'
    if (key === '4' || key === 'eliminate' || key === 'drop') return 'q4'
  }
  return DEFAULT_TASK_PRIORITY
}

export function priorityLabel(priority: TaskPriority): string {
  const meta = PRIORITY_META[priority]
  return `${meta.short} · ${meta.label}`
}

export function taskMatchesPriorityFilter(
  task: Pick<Task, 'priority'>,
  filter: TaskPriority | 'all',
): boolean {
  if (filter === 'all') return true
  return normalizePriority(task.priority) === filter
}

export function applyBulkPriority(
  tasks: Task[],
  priority: TaskPriority,
): Task[] {
  const next = normalizePriority(priority)
  return tasks.map((t) => ({ ...t, priority: next }))
}
