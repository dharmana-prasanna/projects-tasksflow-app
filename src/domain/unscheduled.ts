import { normalizePriority, uiPriority } from './taskPriority'
import type { Task } from '../types'

/** Droppable id for the backlog rail (calendar → backlog). */
export const BACKLOG_DROP_ID = 'backlog-drop'

/** Tasks with no day segments sit in the backlog until dragged onto the board. */
export function isTaskUnscheduled(task: { segments?: Task['segments'] }): boolean {
  return !task.segments || task.segments.length === 0
}

export function filterUnscheduledTasks<T extends { segments?: Task['segments'] }>(
  tasks: T[],
): T[] {
  return tasks.filter(isTaskUnscheduled)
}

export function filterScheduledTasks<T extends { segments?: Task['segments'] }>(
  tasks: T[],
): T[] {
  return tasks.filter((t) => !isTaskUnscheduled(t))
}

/** Clear schedule so the task returns to the backlog. */
export function unscheduleTask<T extends Task>(task: T): T {
  return { ...task, segments: [] }
}

const PRIORITY_ORDER = { q1: 0, q2: 1, q3: 2 } as const

/**
 * Flat backlog order: DoNow → Schedule → Delegate, then title, then id.
 * Each task appears once (no label duplication).
 */
export function sortUnscheduledTasks<
  T extends { id: string; title?: string; priority?: Task['priority'] },
>(tasks: T[]): T[] {
  return tasks.slice().sort((a, b) => {
    const pa = PRIORITY_ORDER[uiPriority(normalizePriority(a.priority))]
    const pb = PRIORITY_ORDER[uiPriority(normalizePriority(b.priority))]
    if (pa !== pb) return pa - pb
    const ta = String(a.title ?? '').localeCompare(String(b.title ?? ''))
    if (ta !== 0) return ta
    return a.id.localeCompare(b.id)
  })
}
