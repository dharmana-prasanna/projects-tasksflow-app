import { useLayoutEffect, useState } from 'react'
import { primarySegment, slotIndex } from '../time'
import type { Task } from '../types'

/** Invisible anchors so dependency arrows still draw when the other task is off-screen. */
export function OffscreenAnchors({
  tasks,
  visibleDates,
}: {
  tasks: Task[]
  visibleDates: string[]
}) {
  const [slotTops, setSlotTops] = useState<number[]>(() => Array(96).fill(40))

  useLayoutEffect(() => {
    const labels = document.querySelectorAll<HTMLElement>('.board__hour')
    if (!labels.length) return
    const tops = Array.from(labels).map(
      (el) => el.offsetTop + el.offsetHeight / 2,
    )
    setSlotTops(tops)
  }, [tasks, visibleDates])

  if (tasks.length === 0 || visibleDates.length === 0) return null

  const first = visibleDates[0]
  const last = visibleDates[visibleDates.length - 1]

  return (
    <div className="offscreen-anchors" aria-hidden="true">
      {tasks.map((task) => {
        const seg = primarySegment(task)
        const before = seg.date < first
        const after = seg.date > last
        if (!before && !after) {
          // Prefer any off-range segment
          const off = task.segments.find(
            (s) => s.date < first || s.date > last,
          )
          if (!off) return null
          const idx = Math.min(
            95,
            Math.max(0, slotIndex(off.startHour, off.startMinute)),
          )
          return (
            <div
              key={task.id}
              data-task-id={task.id}
              className="offscreen-anchor"
              title={task.title}
              style={{
                left: off.date < first ? 48 : undefined,
                right: off.date < first ? undefined : 8,
                top: slotTops[idx] ?? 40,
              }}
            />
          )
        }
        const idx = Math.min(
          95,
          Math.max(0, slotIndex(seg.startHour, seg.startMinute)),
        )
        return (
          <div
            key={task.id}
            data-task-id={task.id}
            className="offscreen-anchor"
            title={task.title}
            style={{
              left: before ? 48 : undefined,
              right: before ? undefined : 8,
              top: slotTops[idx] ?? 40,
            }}
          />
        )
      })}
    </div>
  )
}

export function findOffscreenLinkedTasks(
  allTasks: Task[],
  dependencies: { fromId: string; toId: string }[],
  visibleDates: string[],
): Task[] {
  const visibleDateSet = new Set(visibleDates)
  const visibleIds = new Set(
    allTasks
      .filter((t) => t.segments.some((s) => visibleDateSet.has(s.date)))
      .map((t) => t.id),
  )
  const needed = new Set<string>()

  for (const dep of dependencies) {
    const fromVis = visibleIds.has(dep.fromId)
    const toVis = visibleIds.has(dep.toId)
    if (fromVis && !toVis) needed.add(dep.toId)
    if (toVis && !fromVis) needed.add(dep.fromId)
  }

  return allTasks.filter((t) => needed.has(t.id))
}
