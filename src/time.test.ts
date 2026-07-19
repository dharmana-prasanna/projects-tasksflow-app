import { describe, expect, it } from 'vitest'
import type { DaySegment, Task } from './types'
import {
  END_TIME_SLOTS,
  formatRange,
  formatSlot,
  isSegmentStart,
  moveTaskToSlot,
  normalizeMinute,
  segmentOccupiesSlot,
  segmentRange,
  selectionToRange,
  singleDaySegment,
  slotFromIndex,
  slotIndex,
  syncSegmentsForRange,
  TIME_SLOTS,
} from './time'

describe('REQ-TIME-001 — 15-minute slots', () => {
  it('exposes 96 slots per day', () => {
    expect(TIME_SLOTS).toHaveLength(96)
    expect(TIME_SLOTS[0]).toEqual({ hour: 0, minute: 0 })
    expect(TIME_SLOTS[95]).toEqual({ hour: 23, minute: 45 })
  })

  it('normalizeMinute snaps into 0|15|30|45', () => {
    expect(normalizeMinute(0)).toBe(0)
    expect(normalizeMinute(14)).toBe(0)
    expect(normalizeMinute(15)).toBe(15)
    expect(normalizeMinute(29)).toBe(15)
    expect(normalizeMinute(30)).toBe(30)
    expect(normalizeMinute(44)).toBe(30)
    expect(normalizeMinute(45)).toBe(45)
    expect(normalizeMinute(59)).toBe(45)
    expect(normalizeMinute(undefined)).toBe(0)
    expect(normalizeMinute(null)).toBe(0)
  })
})

describe('REQ-TIME-002 — Slot indexing', () => {
  it('maps hour/minute to 0–96', () => {
    expect(slotIndex(0, 0)).toBe(0)
    expect(slotIndex(6, 0)).toBe(24)
    expect(slotIndex(23, 45)).toBe(95)
    expect(slotIndex(24, 0)).toBe(96)
    expect(slotIndex(25, 0)).toBe(96)
  })

  it('round-trips valid indices; ≥96 → end of day', () => {
    for (let i = 0; i < 96; i++) {
      const slot = slotFromIndex(i)
      expect(slotIndex(slot.hour, slot.minute)).toBe(i)
    }
    expect(slotFromIndex(96)).toEqual({ hour: 24, minute: 0 })
    expect(slotFromIndex(100)).toEqual({ hour: 24, minute: 0 })
  })
})

describe('REQ-TIME-003 — Segment occupancy', () => {
  const seg: DaySegment = {
    date: '2026-07-18',
    startHour: 6,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
  }

  it('occupies [start, end)', () => {
    expect(segmentOccupiesSlot(seg, 6, 0)).toBe(true)
    expect(segmentOccupiesSlot(seg, 6, 15)).toBe(true)
    expect(segmentOccupiesSlot(seg, 6, 30)).toBe(true)
    expect(segmentOccupiesSlot(seg, 6, 45)).toBe(true)
    expect(segmentOccupiesSlot(seg, 7, 0)).toBe(false)
    expect(segmentOccupiesSlot(seg, 5, 45)).toBe(false)
  })

  it('treats end ≤ start as at least 1 hour', () => {
    const bad: DaySegment = {
      date: '2026-07-18',
      startHour: 10,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    }
    expect(segmentRange(bad)).toEqual({ start: 40, end: 44 })
    expect(segmentOccupiesSlot(bad, 10, 0)).toBe(true)
    expect(segmentOccupiesSlot(bad, 10, 45)).toBe(true)
    expect(segmentOccupiesSlot(bad, 11, 0)).toBe(false)
  })

  it('isSegmentStart only at start slot', () => {
    expect(isSegmentStart(seg, 6, 0)).toBe(true)
    expect(isSegmentStart(seg, 6, 15)).toBe(false)
  })
})

describe('REQ-TIME-004 — Single-day segment helpers', () => {
  it('defaults to 1 hour when end omitted', () => {
    expect(singleDaySegment('2026-07-18', 9, 0)).toEqual({
      date: '2026-07-18',
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    })
  })

  it('uses provided exclusive end', () => {
    expect(singleDaySegment('2026-07-18', 9, 0, 9, 45)).toEqual({
      date: '2026-07-18',
      startHour: 9,
      startMinute: 0,
      endHour: 9,
      endMinute: 45,
    })
  })
})

describe('REQ-TIME-005 — Multi-day segment sync', () => {
  it('produces one segment per day and preserves existing times', () => {
    const existing: DaySegment[] = [
      {
        date: '2026-07-18',
        startHour: 8,
        startMinute: 0,
        endHour: 12,
        endMinute: 0,
      },
    ]
    const result = syncSegmentsForRange(
      existing,
      '2026-07-18',
      '2026-07-20',
      { hour: 10, minute: 0 },
      { hour: 16, minute: 0 },
    )
    expect(result.map((s) => s.date)).toEqual([
      '2026-07-18',
      '2026-07-19',
      '2026-07-20',
    ])
    expect(result[0]).toMatchObject({
      startHour: 8,
      endHour: 12,
    })
    // first day already existed — preserved; middle default 9–17; last 9→defaultEnd
    expect(result[1]).toMatchObject({
      startHour: 9,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    })
    expect(result[2]).toMatchObject({
      startHour: 9,
      startMinute: 0,
      endHour: 16,
      endMinute: 0,
    })
  })

  it('single day uses defaultStart→defaultEnd', () => {
    const result = syncSegmentsForRange(
      [],
      '2026-07-18',
      '2026-07-18',
      { hour: 6, minute: 15 },
      { hour: 7, minute: 0 },
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      date: '2026-07-18',
      startHour: 6,
      startMinute: 15,
      endHour: 7,
      endMinute: 0,
    })
  })

  it('new first day defaults to defaultStart→17:00', () => {
    const result = syncSegmentsForRange(
      [],
      '2026-07-18',
      '2026-07-19',
      { hour: 10, minute: 0 },
      { hour: 15, minute: 0 },
    )
    expect(result[0]).toMatchObject({
      startHour: 10,
      endHour: 17,
    })
    expect(result[1]).toMatchObject({
      startHour: 9,
      endHour: 15,
    })
  })
})

describe('REQ-TIME-006 — Move task', () => {
  it('shifts whole task preserving offsets and durations', () => {
    const task: Task = {
      id: 't1',
      title: 'Move me',
      notes: '',
      projectId: 'p1',
      segments: [
        {
          date: '2026-07-18',
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
        {
          date: '2026-07-19',
          startHour: 11,
          startMinute: 0,
          endHour: 12,
          endMinute: 30,
        },
      ],
    }
    const moved = moveTaskToSlot(task, '2026-07-20', 14, 0)
    expect(moved.segments[0]).toMatchObject({
      date: '2026-07-20',
      startHour: 14,
      startMinute: 0,
      endHour: 15,
      endMinute: 0,
    })
    expect(moved.segments[1]).toMatchObject({
      date: '2026-07-21',
      startHour: 16,
      startMinute: 0,
      endHour: 17,
      endMinute: 30,
    })
  })

  it('creates a 1-hour segment when task has no segments', () => {
    const task: Task = {
      id: 't2',
      title: 'Empty',
      notes: '',
      projectId: 'p1',
      segments: [],
    }
    const moved = moveTaskToSlot(task, '2026-07-18', 8, 15)
    expect(moved.segments).toEqual([
      {
        date: '2026-07-18',
        startHour: 8,
        startMinute: 15,
        endHour: 9,
        endMinute: 15,
      },
    ])
  })
})

describe('REQ-TIME-007 — Slot multi-select → create range', () => {
  it('one cell → 1 hour (4 slots)', () => {
    // 09:00 is index 36
    expect(selectionToRange(36, 36)).toEqual({
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    })
  })

  it('multiple cells → exclusive end after last selected', () => {
    // 09:00 through 09:45 inclusive → end 10:00
    expect(selectionToRange(36, 39)).toEqual({
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    })
    // reverse drag
    expect(selectionToRange(39, 36)).toEqual({
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    })
  })

  it('supports 15-minute exact spans', () => {
    // 06:00 and 06:15 → end 06:30
    expect(selectionToRange(24, 25)).toEqual({
      startHour: 6,
      startMinute: 0,
      endHour: 6,
      endMinute: 30,
    })
  })
})

describe('REQ-TIME-008 — Formatting', () => {
  it('formatSlot uses 12-hour clock', () => {
    expect(formatSlot(0, 0)).toBe('12:00am')
    expect(formatSlot(9, 15)).toBe('9:15am')
    expect(formatSlot(12, 0)).toBe('12:00pm')
    expect(formatSlot(13, 30)).toBe('1:30pm')
    expect(formatSlot(24, 0)).toBe('12:00am')
  })

  it('formatRange is start–end', () => {
    expect(
      formatRange({
        date: '2026-07-18',
        startHour: 9,
        startMinute: 0,
        endHour: 10,
        endMinute: 0,
      }),
    ).toBe('9:00am–10:00am')
  })

  it('END_TIME_SLOTS includes exclusive end-of-day', () => {
    expect(END_TIME_SLOTS.at(-1)).toEqual({ hour: 24, minute: 0 })
  })
})
