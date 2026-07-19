import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  boardColumns,
  loadColWidthPrefs,
  resolveColWidth,
  saveColWidthPrefs,
  withColWidth,
  type ColWidthPrefs,
} from '../boardLayout'
import { clientPointToRoot, elementCenterInRoot } from '../domain/arrowGeometry'
import {
  movementExceedsSlop,
  shouldArmSlotSelectImmediately,
  shouldCommitSlotSelect,
  SLOT_SELECT_TOUCH_DELAY_MS,
} from '../domain/slotSelectGesture'
import {
  formatRange,
  isSegmentStart,
  moveTaskToSlot,
  primarySegment,
  segmentOccupiesSlot,
  selectionToRange,
  slotIndex,
  TIME_SLOTS,
} from '../time'
import type { ColoredTask, DaySegment, Task } from '../types'
import {
  DependencyArrows,
  type ColoredDependency,
  type DraftLink,
} from './DependencyArrows'
import { DraggableTask } from './DraggableTask'
import { DroppableCell } from './DroppableCell'
import {
  findOffscreenLinkedTasks,
  OffscreenAnchors,
} from './OffscreenAnchors'

type Props = {
  days: string[]
  tasks: ColoredTask[]
  dependencies: ColoredDependency[]
  activeFlowColor?: string
  activeFlowId?: string | null
  onCreateTask: (range: {
    date: string
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number
  }) => void
  onTaskClick: (task: Task) => void
  onMoveTask: (task: Task) => void
  onLinkTasks: (fromId: string, toId: string) => void
  onRemoveDependency: (dependencyId: string) => void
}

type LinkSession = {
  fromId: string
  pointerId: number
  x1: number
  y1: number
  x2: number
  y2: number
  overTaskId: string | null
}

type SlotSelectSession = {
  pointerId: number
  date: string
  anchorIndex: number
  focusIndex: number
  startX: number
  startY: number
  pointerType: string
  /** False until mouse start or touch hold delay elapses. */
  armed: boolean
  /** True when the gesture was abandoned as a scroll. */
  cancelled: boolean
}

export function CalendarGrid({
  days,
  tasks,
  dependencies,
  activeFlowColor = '#c48a12',
  activeFlowId = null,
  onCreateTask,
  onTaskClick,
  onMoveTask,
  onLinkTasks,
  onRemoveDependency,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const scrolledToDayHours = useRef(false)
  const [activeTask, setActiveTask] = useState<ColoredTask | null>(null)
  const [activeSegment, setActiveSegment] = useState<DaySegment | null>(null)
  const [linkSession, setLinkSession] = useState<LinkSession | null>(null)
  const linkRef = useRef<LinkSession | null>(null)
  const [slotSelect, setSlotSelect] = useState<SlotSelectSession | null>(null)
  const slotSelectRef = useRef<SlotSelectSession | null>(null)
  const slotArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearSlotArmTimer() {
    if (slotArmTimerRef.current != null) {
      clearTimeout(slotArmTimerRef.current)
      slotArmTimerRef.current = null
    }
  }

  function cancelSlotSelect() {
    clearSlotArmTimer()
    const s = slotSelectRef.current
    if (!s) return
    slotSelectRef.current = { ...s, cancelled: true, armed: false }
    setSlotSelect(null)
  }
  const [colPrefs, setColPrefs] = useState<ColWidthPrefs>(() => loadColWidthPrefs())
  const [resizingCols, setResizingCols] = useState(false)
  const colResizeRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  const dayWidth = useMemo(
    () => resolveColWidth(days.length, colPrefs),
    [days.length, colPrefs],
  )
  const columns = useMemo(
    () => boardColumns(days.length, dayWidth),
    [days.length, dayWidth],
  )

  function persistColWidth(next: ColWidthPrefs) {
    setColPrefs(next)
    saveColWidthPrefs(next)
  }

  function startColResize(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    colResizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: dayWidth,
    }
    setResizingCols(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onColResizeMove(e: React.PointerEvent) {
    const s = colResizeRef.current
    if (!s || s.pointerId !== e.pointerId) return
    const next = withColWidth(
      colPrefs,
      days.length,
      s.startWidth + (e.clientX - s.startX),
    )
    setColPrefs(next)
  }

  function onColResizeEnd(e: React.PointerEvent) {
    const s = colResizeRef.current
    if (!s || s.pointerId !== e.pointerId) return
    colResizeRef.current = null
    setResizingCols(false)
    const next = withColWidth(
      colPrefs,
      days.length,
      s.startWidth + (e.clientX - s.startX),
    )
    persistColWidth(next)
  }

  function resetColWidth(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = { ...colPrefs }
    delete next[String(days.length)]
    persistColWidth(next)
  }

  useEffect(() => {
    if (scrolledToDayHours.current || !scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(
      '[data-cell-hour="8"][data-cell-minute="0"]',
    )
    if (el) {
      el.scrollIntoView({ block: 'start' })
      scrolledToDayHours.current = true
    }
  }, [])

  // Mouse: short distance drag. Touch: brief hold so iPhone can scroll the board first.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
  )

  const offscreenTasks = useMemo(
    () => findOffscreenLinkedTasks(tasks, dependencies, days),
    [tasks, dependencies, days],
  )

  const layoutKey = [
    'grid-seg',
    days.join(','),
    ...tasks.map((t) =>
      `${t.id}:${t.segments.map((s) => `${s.date}@${s.startHour}:${s.startMinute}-${s.endHour}:${s.endMinute}`).join(',')}`,
    ),
    ...offscreenTasks.map((t) => `g:${t.id}`),
    activeTask?.id ?? '',
    linkSession?.overTaskId ?? '',
    String(dependencies.length),
  ].join('|')

  useEffect(() => {
    linkRef.current = linkSession
  }, [linkSession])

  useEffect(() => {
    slotSelectRef.current = slotSelect
  }, [slotSelect])

  useEffect(() => {
    function cellUnderPoint(clientX: number, clientY: number) {
      const els = document.elementsFromPoint(clientX, clientY)
      for (const el of els) {
        if (!(el instanceof Element)) continue
        const node = el.closest<HTMLElement>('[data-cell-date]')
        if (!node || node.classList.contains('offscreen-anchor')) continue
        // Don't retarget through a task chip
        if (el.closest('[data-task-id]')) continue
        const date = node.dataset.cellDate
        const hour = Number(node.dataset.cellHour)
        const minute = Number(node.dataset.cellMinute)
        if (!date || Number.isNaN(hour) || Number.isNaN(minute)) continue
        return { date, hour, minute, index: slotIndex(hour, minute) }
      }
      return null
    }

    function onMove(e: PointerEvent) {
      const s = slotSelectRef.current
      if (!s || s.pointerId !== e.pointerId || s.cancelled) return

      // Touch: finger moved before hold armed → treat as scroll, do not create.
      if (
        !s.armed &&
        movementExceedsSlop(s.startX, s.startY, e.clientX, e.clientY)
      ) {
        clearSlotArmTimer()
        slotSelectRef.current = { ...s, cancelled: true }
        setSlotSelect(null)
        return
      }

      if (!s.armed) return

      const cell = cellUnderPoint(e.clientX, e.clientY)
      if (!cell || cell.date !== s.date) return
      if (cell.index === s.focusIndex) return
      const next = { ...s, focusIndex: cell.index }
      slotSelectRef.current = next
      setSlotSelect(next)
    }

    function onUp(e: PointerEvent) {
      const s = slotSelectRef.current
      if (!s || s.pointerId !== e.pointerId) return
      clearSlotArmTimer()
      slotSelectRef.current = null
      setSlotSelect(null)

      if (!shouldCommitSlotSelect(s)) return

      const range = selectionToRange(s.anchorIndex, s.focusIndex)
      onCreateTask({
        date: s.date,
        ...range,
      })
    }

    function onCancel(e: PointerEvent) {
      const s = slotSelectRef.current
      if (!s || s.pointerId !== e.pointerId) return
      clearSlotArmTimer()
      slotSelectRef.current = null
      setSlotSelect(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [onCreateTask])

  // Board scroll (touch pan) abandons any pending slot-select create.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      const s = slotSelectRef.current
      if (!s || s.cancelled) return
      cancelSlotSelect()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function startSlotSelect(
    date: string,
    hour: number,
    minute: number,
    e: React.PointerEvent,
  ) {
    if (activeTask || linkRef.current) return
    if (e.button !== 0) return
    // Ignore when starting on a task / continuation / link handle
    const target = e.target
    if (target instanceof Element) {
      if (
        target.closest('[data-task-id]') ||
        target.closest('.task-continuation') ||
        target.closest('.task__link')
      ) {
        return
      }
    }

    clearSlotArmTimer()
    const armed = shouldArmSlotSelectImmediately(e.pointerType)
    // Only suppress browser gestures once mouse selection is active.
    if (armed) e.preventDefault()

    const index = slotIndex(hour, minute)
    const session: SlotSelectSession = {
      pointerId: e.pointerId,
      date,
      anchorIndex: index,
      focusIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      armed,
      cancelled: false,
    }
    slotSelectRef.current = session
    setSlotSelect(armed ? session : null)

    if (!armed) {
      const pointerId = e.pointerId
      slotArmTimerRef.current = setTimeout(() => {
        slotArmTimerRef.current = null
        const cur = slotSelectRef.current
        if (!cur || cur.pointerId !== pointerId || cur.cancelled) return
        const next = { ...cur, armed: true }
        slotSelectRef.current = next
        setSlotSelect(next)
      }, SLOT_SELECT_TOUCH_DELAY_MS)
    }
  }

  function isSlotSelected(date: string, hour: number, minute: number) {
    if (!slotSelect || slotSelect.date !== date) return false
    const i = slotIndex(hour, minute)
    const lo = Math.min(slotSelect.anchorIndex, slotSelect.focusIndex)
    const hi = Math.max(slotSelect.anchorIndex, slotSelect.focusIndex)
    return i >= lo && i <= hi
  }

  useEffect(() => {
    function taskUnderPoint(clientX: number, clientY: number, fromId: string) {
      const els = document.elementsFromPoint(clientX, clientY)
      for (const el of els) {
        if (!(el instanceof Element)) continue
        const node = el.closest<HTMLElement>('[data-task-id]')
        const id = node?.dataset.taskId
        if (id && id !== fromId && !node?.classList.contains('offscreen-anchor')) {
          return id
        }
      }
      return null
    }

    function onMove(e: PointerEvent) {
      const s = linkRef.current
      if (!s || s.pointerId !== e.pointerId) return
      const overTaskId = taskUnderPoint(e.clientX, e.clientY, s.fromId)
      const root = canvasRef.current
      const pt = root
        ? clientPointToRoot(root, e.clientX, e.clientY)
        : { x: e.clientX, y: e.clientY }
      const next = { ...s, x2: pt.x, y2: pt.y, overTaskId }
      linkRef.current = next
      setLinkSession(next)
    }

    function onUp(e: PointerEvent) {
      const s = linkRef.current
      if (!s || s.pointerId !== e.pointerId) return
      const overTaskId = taskUnderPoint(e.clientX, e.clientY, s.fromId)
      linkRef.current = null
      setLinkSession(null)
      if (overTaskId) onLinkTasks(s.fromId, overTaskId)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [onLinkTasks])

  function segmentsInCell(date: string, hour: number, minute: number) {
    const out: { task: ColoredTask; segment: DaySegment; isStart: boolean }[] =
      []
    for (const task of tasks) {
      for (const segment of task.segments) {
        if (segment.date !== date) continue
        if (!segmentOccupiesSlot(segment, hour, minute)) continue
        out.push({
          task,
          segment,
          isStart: isSegmentStart(segment, hour, minute),
        })
      }
    }
    return out
  }

  function handleDragStart(event: DragStartEvent) {
    if (linkRef.current) return
    const task = event.active.data.current?.task as ColoredTask | undefined
    const segmentDate = event.active.data.current?.segmentDate as string | undefined
    const resolved =
      task ?? tasks.find((t) => event.active.id.toString().startsWith(t.id))
    setActiveTask(resolved ?? null)
    if (resolved) {
      const seg =
        resolved.segments.find((s) => s.date === segmentDate) ??
        primarySegment(resolved)
      setActiveSegment(seg)
    } else {
      setActiveSegment(null)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const task = active.data.current?.task as ColoredTask | undefined
    setActiveTask(null)
    setActiveSegment(null)
    if (!over || !task) return
    const date = over.data.current?.date as string | undefined
    const hour = over.data.current?.hour as number | undefined
    const minute = over.data.current?.minute as number | undefined
    if (!date || hour == null || minute == null) return
    const moved = moveTaskToSlot(task, date, hour, minute)
    onMoveTask(moved)
  }

  function startLink(task: Task, e: React.PointerEvent<HTMLButtonElement>) {
    const root = canvasRef.current
    const taskEl = root?.querySelector<HTMLElement>(
      `[data-task-id="${task.id}"]:not(.offscreen-anchor)`,
    )
    const start = root && taskEl
      ? elementCenterInRoot(taskEl, root)
      : root
        ? clientPointToRoot(root, e.clientX, e.clientY)
        : { x: e.clientX, y: e.clientY }
    const tip = root
      ? clientPointToRoot(root, e.clientX, e.clientY)
      : { x: e.clientX, y: e.clientY }

    const session: LinkSession = {
      fromId: task.id,
      pointerId: e.pointerId,
      x1: start.x,
      y1: start.y,
      x2: tip.x,
      y2: tip.y,
      overTaskId: null,
    }
    linkRef.current = session
    setLinkSession(session)
  }

  const draft: DraftLink | null = linkSession
    ? {
        x1: linkSession.x1,
        y1: linkSession.y1,
        x2: linkSession.x2,
        y2: linkSession.y2,
        color: activeFlowColor,
      }
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveTask(null)
        setActiveSegment(null)
      }}
    >
      <div className="board-shell">
      <div
        className={[
          'board-scroll',
          activeTask ? 'board-scroll--dragging' : '',
          linkSession ? 'board-scroll--linking' : '',
          slotSelect ? 'board-scroll--selecting' : '',
          resizingCols ? 'board-scroll--resizing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        ref={scrollRef}
      >
        <div className="board-canvas" ref={canvasRef}>
        <div
          className="board-header"
          style={{
            gridTemplateColumns: columns,
          }}
        >
          <div className="board__corner">Time</div>
          {days.map((day) => {
            const d = parseISO(day)
            return (
              <div key={day} className="board__day">
                <span className="board__day-name">{format(d, 'EEE')}</span>
                <span className="board__day-date">{format(d, 'M/d')}</span>
                <button
                  type="button"
                  className="board__col-resize"
                  aria-label={`Resize day columns (currently ${dayWidth}px). Double-click to reset.`}
                  title="Drag to widen/narrow columns · double-click to reset"
                  onPointerDown={startColResize}
                  onPointerMove={onColResizeMove}
                  onPointerUp={onColResizeEnd}
                  onPointerCancel={onColResizeEnd}
                  onDoubleClick={resetColWidth}
                />
              </div>
            )
          })}
        </div>

        <div
          className="board"
          data-arrow-root
          style={{
            gridTemplateColumns: columns,
            gridTemplateRows: `repeat(${TIME_SLOTS.length}, auto)`,
          }}
        >
          {TIME_SLOTS.map(({ hour, minute }) => (
            <Fragment key={`${hour}:${minute}`}>
              <div
                className={[
                  'board__hour',
                  minute === 0 ? 'board__hour--major' : 'board__hour--minor',
                ].join(' ')}
              >
                {minute === 0 ? formatSlotLabel(hour, 0) : `:${String(minute).padStart(2, '0')}`}
              </div>
              {days.map((day) => {
                const items = segmentsInCell(day, hour, minute)
                const hasContinuation = items.some((i) => !i.isStart)
                return (
                  <DroppableCell
                    key={`${day}@${hour}:${minute}`}
                    date={day}
                    hour={hour}
                    minute={minute}
                    selected={isSlotSelected(day, hour, minute)}
                    onPointerDown={(e) => startSlotSelect(day, hour, minute, e)}
                  >
                    {hasContinuation && (
                      <div
                        className="task-continuation"
                        style={{
                          ['--task-color' as string]:
                            items.find((i) => !i.isStart)?.task.color ?? '#888',
                        }}
                        title={items
                          .filter((i) => !i.isStart)
                          .map((i) => i.task.title)
                          .join(', ')}
                        onClick={(e) => {
                          e.stopPropagation()
                          const cont = items.find((i) => !i.isStart)
                          if (cont) onTaskClick(cont.task)
                        }}
                      />
                    )}
                    {items
                      .filter((i) => i.isStart)
                      .map(({ task, segment }) => (
                        <DraggableTask
                          key={`${task.id}-${segment.date}`}
                          task={task}
                          segment={segment}
                          isLinkSource={linkSession?.fromId === task.id}
                          isLinkTarget={linkSession?.overTaskId === task.id}
                          onTaskClick={onTaskClick}
                          onLinkPointerDown={startLink}
                        />
                      ))}
                  </DroppableCell>
                )
              })}
            </Fragment>
          ))}
        </div>

        <OffscreenAnchors tasks={offscreenTasks} visibleDates={days} />

        <DependencyArrows
          dependencies={dependencies}
          layoutKey={layoutKey}
          activeFlowId={activeFlowId}
          containerRef={canvasRef}
          interactive={!activeTask && !linkSession}
          draft={draft}
          onRemove={onRemoveDependency}
        />
        </div>
      </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask && activeSegment ? (
          <div
            className="task task--ghost"
            style={{ ['--task-color' as string]: activeTask.color }}
          >
            <span className="task__title">{activeTask.title}</span>
            <span className="task__time">{formatRange(activeSegment)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function formatSlotLabel(hour: number, minute: number): string {
  const period = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const mm = String(minute).padStart(2, '0')
  return `${h12}:${mm}${period}`
}

export { TIME_SLOTS }
