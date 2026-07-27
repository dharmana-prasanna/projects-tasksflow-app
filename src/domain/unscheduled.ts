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
