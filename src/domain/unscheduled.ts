import type { Task } from '../types'

/** Droppable id for the backlog rail (calendar → backlog). */
export const BACKLOG_DROP_ID = 'backlog-drop'

/** Section title for backlog tasks with no labels. */
export const UNLABELED_GROUP = 'Unlabeled'

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

export type BacklogLabelGroup<T> = {
  key: string
  label: string
  tasks: T[]
}

/**
 * Group backlog tasks by label for the side panel.
 * A task with multiple labels appears under each; unlabeled tasks go in Unlabeled.
 * Groups sorted A–Z; Unlabeled last. Within a group, tasks keep input order.
 */
export function groupUnscheduledByLabel<
  T extends { id: string; labels?: string[] },
>(tasks: T[]): BacklogLabelGroup<T>[] {
  const map = new Map<string, BacklogLabelGroup<T>>()

  for (const task of tasks) {
    const raw = (task.labels ?? [])
      .map((l) => String(l).trim())
      .filter(Boolean)
    const labels = raw.length > 0 ? [...new Set(raw)] : [UNLABELED_GROUP]

    for (const label of labels) {
      const key = label.toLowerCase()
      const existing = map.get(key)
      if (existing) {
        if (!existing.tasks.some((t) => t.id === task.id)) {
          existing.tasks.push(task)
        }
      } else {
        map.set(key, { key, label, tasks: [task] })
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.label === UNLABELED_GROUP) return 1
    if (b.label === UNLABELED_GROUP) return -1
    return a.label.localeCompare(b.label)
  })
}
