import {
  addDays,
  eachDayOfInterval,
  format,
  parseISO,
  differenceInCalendarDays,
} from 'date-fns'
import type { DaySegment, Task } from './types'

/** 15-minute slots across a full day (96 rows). */
export const SLOT_MINUTES = [0, 15, 30, 45] as const

export type SlotMinute = (typeof SLOT_MINUTES)[number]

export type TimeSlot = {
  hour: number
  minute: number
}

export const TIME_SLOTS: TimeSlot[] = Array.from({ length: 96 }, (_, i) => ({
  hour: Math.floor(i / 4),
  minute: SLOT_MINUTES[i % 4],
}))

/** Slot index 0–96 (96 = midnight / end of day, exclusive end). */
export function slotIndex(hour: number, minute: number): number {
  if (hour >= 24) return 96
  const m = normalizeMinute(minute)
  const h = Math.min(23, Math.max(0, Math.floor(hour)))
  return h * 4 + SLOT_MINUTES.indexOf(m)
}

export function slotFromIndex(index: number): TimeSlot {
  if (index >= 96) return { hour: 24, minute: 0 }
  const i = Math.min(95, Math.max(0, index))
  return TIME_SLOTS[i]
}

export function normalizeMinute(minute: number | undefined | null): SlotMinute {
  const n = Number(minute)
  if (n >= 45) return 45
  if (n >= 30) return 30
  if (n >= 15) return 15
  return 0
}

export function formatSlot(hour: number, minute: number = 0): string {
  if (hour >= 24) return '12:00am'
  const period = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const mm = String(normalizeMinute(minute)).padStart(2, '0')
  return `${h12}:${mm}${period}`
}

export function formatRange(seg: DaySegment): string {
  return `${formatSlot(seg.startHour, seg.startMinute)}–${formatSlot(seg.endHour, seg.endMinute)}`
}

/** End index is exclusive. */
export function segmentRange(seg: DaySegment): { start: number; end: number } {
  const start = slotIndex(seg.startHour, seg.startMinute)
  let end = slotIndex(seg.endHour, seg.endMinute)
  if (end <= start) end = Math.min(96, start + 4)
  return { start, end }
}

export function normalizeSegment(seg: DaySegment): DaySegment {
  const { start, end } = segmentRange(seg)
  const s = slotFromIndex(start)
  const e = slotFromIndex(end)
  return {
    date: seg.date,
    startHour: s.hour,
    startMinute: s.minute,
    endHour: e.hour,
    endMinute: e.minute,
  }
}

export function segmentOccupiesSlot(
  seg: DaySegment,
  hour: number,
  minute: number,
): boolean {
  const i = slotIndex(hour, minute)
  const { start, end } = segmentRange(seg)
  return i >= start && i < end
}

export function isSegmentStart(
  seg: DaySegment,
  hour: number,
  minute: number,
): boolean {
  return (
    seg.startHour === hour &&
    normalizeMinute(seg.startMinute) === normalizeMinute(minute)
  )
}

export function primarySegment(task: Task): DaySegment {
  const sorted = [...task.segments].sort((a, b) => a.date.localeCompare(b.date))
  return (
    sorted[0] ?? {
      date: format(new Date(), 'yyyy-MM-dd'),
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    }
  )
}

export function datesBetween(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  if (end < start) return [startDate]
  return eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'))
}

/**
 * Build segments for a date range.
 * Keeps times for dates that already exist; fills new days with defaults.
 */
export function syncSegmentsForRange(
  existing: DaySegment[],
  startDate: string,
  endDate: string,
  defaultStart: { hour: number; minute: number },
  defaultEnd: { hour: number; minute: number },
): DaySegment[] {
  const dates = datesBetween(startDate, endDate)
  const byDate = new Map(existing.map((s) => [s.date, s]))
  return dates.map((date, idx) => {
    const prev = byDate.get(date)
    if (prev) return normalizeSegment(prev)
    if (dates.length === 1) {
      return normalizeSegment({
        date,
        startHour: defaultStart.hour,
        startMinute: defaultStart.minute,
        endHour: defaultEnd.hour,
        endMinute: defaultEnd.minute,
      })
    }
    if (idx === 0) {
      return normalizeSegment({
        date,
        startHour: defaultStart.hour,
        startMinute: defaultStart.minute,
        endHour: 17,
        endMinute: 0,
      })
    }
    if (idx === dates.length - 1) {
      return normalizeSegment({
        date,
        startHour: 9,
        startMinute: 0,
        endHour: defaultEnd.hour,
        endMinute: defaultEnd.minute,
      })
    }
    return normalizeSegment({
      date,
      startHour: 9,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    })
  })
}

export function singleDaySegment(
  date: string,
  startHour: number,
  startMinute: number,
  endHour?: number,
  endMinute?: number,
): DaySegment {
  const start = slotIndex(startHour, startMinute)
  const end =
    endHour != null ? slotIndex(endHour, endMinute ?? 0) : Math.min(96, start + 4)
  const e = slotFromIndex(end <= start ? Math.min(96, start + 4) : end)
  return normalizeSegment({
    date,
    startHour,
    startMinute,
    endHour: e.hour,
    endMinute: e.minute,
  })
}

/** Move whole task so its earliest segment starts at the drop slot. */
export function moveTaskToSlot(
  task: Task,
  date: string,
  hour: number,
  minute: number,
): Task {
  const sorted = [...task.segments].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) {
    // Backlog → board: default to one 15-minute slot at the drop cell.
    const start = slotIndex(hour, minute)
    const end = slotFromIndex(Math.min(96, start + 1))
    return {
      ...task,
      segments: [
        singleDaySegment(date, hour, minute, end.hour, end.minute),
      ],
    }
  }

  const first = sorted[0]
  const dayDelta = differenceInCalendarDays(parseISO(date), parseISO(first.date))
  const slotDelta =
    slotIndex(hour, minute) - slotIndex(first.startHour, first.startMinute)

  const segments = sorted.map((seg) => {
    const newDate = format(addDays(parseISO(seg.date), dayDelta), 'yyyy-MM-dd')
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

/** Options for time pickers including exclusive end-of-day (24:00). */
export const END_TIME_SLOTS: TimeSlot[] = [
  ...TIME_SLOTS.slice(1),
  { hour: 24, minute: 0 },
]

/**
 * Convert a board multi-select (inclusive slot indices) into a create range.
 * One cell → 1 hour; multiple cells → exact span (end exclusive).
 */
export function selectionToRange(
  anchorIndex: number,
  focusIndex: number,
): {
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
} {
  const lo = Math.min(anchorIndex, focusIndex)
  const hi = Math.max(anchorIndex, focusIndex)
  const endIndex = hi === lo ? Math.min(96, lo + 4) : hi + 1
  const start = slotFromIndex(lo)
  const end = slotFromIndex(endIndex)
  return {
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
  }
}
