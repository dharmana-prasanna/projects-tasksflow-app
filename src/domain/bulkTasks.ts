import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  normalizeSegment,
  segmentRange,
  slotFromIndex,
  slotIndex,
  moveTaskToSlot,
} from '../time'
import type { Task } from '../types'
import {
  addTaskLabel,
  normalizeLabel,
  removeTaskLabel,
} from './taskLabels'
import { unscheduleTask } from './unscheduled'

/** Click modifiers / sticky selection → toggle instead of open editor. */
export function shouldToggleTaskSelection(
  event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
  selectionActive: boolean,
): boolean {
  return Boolean(
    event.metaKey || event.ctrlKey || event.shiftKey || selectionActive,
  )
}

export function toggleTaskId(selected: string[], taskId: string): string[] {
  return selected.includes(taskId)
    ? selected.filter((id) => id !== taskId)
    : [...selected, taskId]
}

/**
 * Shift every segment date by `dayDelta` days; keep times.
 * Unscheduled tasks are unchanged.
 */
export function shiftTaskByDays(task: Task, dayDelta: number): Task {
  if (dayDelta === 0 || task.segments.length === 0) return task
  return {
    ...task,
    segments: task.segments.map((seg) =>
      normalizeSegment({
        ...seg,
        date: format(addDays(parseISO(seg.date), dayDelta), 'yyyy-MM-dd'),
      }),
    ),
  }
}

/**
 * Move a scheduled task so its earliest segment lands on `targetDate`
 * (same start time). Unscheduled tasks are unchanged.
 */
export function moveTaskToDate(task: Task, targetDate: string): Task {
  const sorted = [...task.segments].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) return task
  const dayDelta = differenceInCalendarDays(
    parseISO(targetDate),
    parseISO(sorted[0].date),
  )
  return shiftTaskByDays(task, dayDelta)
}

export function moveTasksToDate(tasks: Task[], targetDate: string): Task[] {
  return tasks.map((t) => moveTaskToDate(t, targetDate))
}

/** Apply day + slot deltas like `moveTaskToSlot`, without a fixed target. */
export function applyTaskSlotDeltas(
  task: Task,
  dayDelta: number,
  slotDelta: number,
): Task {
  if (task.segments.length === 0) return task
  const segments = [...task.segments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((seg) => {
      const newDate = format(
        addDays(parseISO(seg.date), dayDelta),
        'yyyy-MM-dd',
      )
      const { start, end } = segmentRange(seg)
      const dur = end - start
      let newStart = start + slotDelta
      newStart = Math.min(95, Math.max(0, newStart))
      let newEnd = newStart + Math.max(1, dur)
      if (newEnd > 96) {
        const overflow = newEnd - 96
        newStart = Math.max(0, newStart - overflow)
        newEnd = 96
      }
      const s = slotFromIndex(newStart)
      const e = slotFromIndex(newEnd)
      return normalizeSegment({
        date: newDate,
        startHour: s.hour,
        startMinute: s.minute,
        endHour: e.hour,
        endMinute: e.minute,
      })
    })
  return { ...task, segments }
}

/**
 * Move a set of tasks relative to a dragged task’s drop on a calendar slot.
 * All scheduled selected tasks share the same day/slot deltas as the dragged task.
 * Unscheduled non-dragged tasks are left alone; the dragged backlog item is scheduled.
 */
export function moveSelectedTasksToSlot(
  selected: Task[],
  draggedId: string,
  date: string,
  hour: number,
  minute: number,
): Task[] {
  const dragged = selected.find((t) => t.id === draggedId)
  if (!dragged) return []

  const sorted = [...dragged.segments].sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  if (sorted.length === 0) {
    return selected.map((t) =>
      t.id === draggedId ? moveTaskToSlot(t, date, hour, minute) : t,
    )
  }

  const first = sorted[0]
  const dayDelta = differenceInCalendarDays(
    parseISO(date),
    parseISO(first.date),
  )
  const slotDelta =
    slotIndex(hour, minute) - slotIndex(first.startHour, first.startMinute)

  return selected.map((t) => {
    if (t.segments.length === 0) {
      return t.id === draggedId ? moveTaskToSlot(t, date, hour, minute) : t
    }
    return applyTaskSlotDeltas(t, dayDelta, slotDelta)
  })
}

export function unscheduleSelectedTasks(selected: Task[]): Task[] {
  return selected
    .filter((t) => t.segments.length > 0)
    .map((t) => unscheduleTask(t))
}

/** Add and/or remove labels on each task. */
export function applyBulkLabels(
  tasks: Task[],
  options: { add?: string; remove?: string },
): Task[] {
  const add = options.add ? normalizeLabel(options.add) : null
  const remove = options.remove ? normalizeLabel(options.remove) : null
  if (!add && !remove) return tasks

  return tasks.map((task) => {
    let labels = task.labels
    if (remove) labels = removeTaskLabel(labels, remove)
    if (add) labels = addTaskLabel(labels, add)
    return { ...task, labels }
  })
}
