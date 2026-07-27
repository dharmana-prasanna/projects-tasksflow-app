import type { Task } from '../types'

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
