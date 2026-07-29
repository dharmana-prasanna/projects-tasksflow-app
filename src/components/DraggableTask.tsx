import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef } from 'react'
import { shouldToggleTaskSelection } from '../domain/bulkTasks'
import { normalizePriority, PRIORITY_META } from '../domain/taskPriority'
import { formatRange } from '../time'
import type { ColoredTask, DaySegment, Task, TaskActivateOptions } from '../types'

type Props = {
  task: ColoredTask
  segment: DaySegment
  selected?: boolean
  selectionActive?: boolean
  isLinkTarget?: boolean
  isLinkSource?: boolean
  onTaskClick: (task: Task, options?: TaskActivateOptions) => void
  onLinkPointerDown: (task: Task, e: React.PointerEvent<HTMLButtonElement>) => void
}

export function DraggableTask({
  task,
  segment,
  selected = false,
  selectionActive = false,
  isLinkTarget,
  isLinkSource,
  onTaskClick,
  onLinkPointerDown,
}: Props) {
  const dragged = useRef(false)
  const dragId = `${task.id}::${segment.date}`
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragId,
      data: { task, segmentDate: segment.date },
    })

  useEffect(() => {
    if (isDragging) dragged.current = true
  }, [isDragging])

  const style = {
    ['--task-color' as string]: task.color,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  const multiDay = task.segments.length > 1
  const priority = normalizePriority(task.priority)
  const priorityMeta = PRIORITY_META[priority]

  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      className={[
        'task',
        'task--draggable',
        `task--priority-${priority}`,
        selected ? 'task--selected' : '',
        isLinkSource ? 'task--link-source' : '',
        isLinkTarget ? 'task--link-target' : '',
        isDragging ? 'task--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <button
        type="button"
        className="task__select"
        aria-label={selected ? `Deselect ${task.title}` : `Select ${task.title}`}
        aria-pressed={selected}
        title={selected ? 'Deselect' : 'Select'}
        onClick={(e) => {
          e.stopPropagation()
          onTaskClick(task, { toggle: true })
        }}
      >
        {selected ? '✓' : ''}
      </button>
      <button
        type="button"
        className="task__body"
        {...listeners}
        {...attributes}
        onClick={(e) => {
          e.stopPropagation()
          if (dragged.current) {
            dragged.current = false
            return
          }
          const toggle = shouldToggleTaskSelection(e, selectionActive)
          onTaskClick(task, { toggle })
        }}
      >
        <span className="task__title">{task.title}</span>
        <span className="task__time">{formatRange(segment)}</span>
        <span
          className={`task__priority task__priority--${priority}`}
          title={priorityMeta.hint}
        >
          {priorityMeta.short}
        </span>
        {multiDay && <span className="task__badge">multi-day</span>}
      </button>

      <button
        type="button"
        className="task__link"
        title="Drag to another task to link"
        aria-label={`Link from ${task.title}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onLinkPointerDown(task, e)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        →
      </button>
    </div>
  )
}
