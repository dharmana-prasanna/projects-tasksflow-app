import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef } from 'react'
import { shouldToggleTaskSelection } from '../domain/bulkTasks'
import { normalizePriority, PRIORITY_META, uiPriority } from '../domain/taskPriority'
import type { ColoredTask, Task, TaskActivateOptions } from '../types'

type Props = {
  task: ColoredTask
  /** Disambiguates drag ids when a task appears under multiple label groups. */
  groupKey?: string
  selected?: boolean
  selectionActive?: boolean
  onTaskClick: (task: Task, options?: TaskActivateOptions) => void
}

/** Draggable backlog card — drop onto a calendar slot to schedule. */
export function UnscheduledTaskCard({
  task,
  groupKey,
  selected = false,
  selectionActive = false,
  onTaskClick,
}: Props) {
  const dragged = useRef(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `${task.id}::unscheduled::${groupKey ?? '_'}`,
      data: { task, unscheduled: true },
    })

  useEffect(() => {
    if (isDragging) dragged.current = true
  }, [isDragging])

  const priority = uiPriority(normalizePriority(task.priority))
  const priorityMeta = PRIORITY_META[priority]

  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      className={[
        'unscheduled-card',
        `unscheduled-card--priority-${priority}`,
        selected ? 'unscheduled-card--selected' : '',
        isDragging ? 'unscheduled-card--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--task-color' as string]: task.color,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <button
        type="button"
        className="unscheduled-card__select"
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
        className="unscheduled-card__body"
        {...listeners}
        {...attributes}
        onClick={(e) => {
          if (dragged.current) {
            dragged.current = false
            return
          }
          const toggle = shouldToggleTaskSelection(e, selectionActive)
          onTaskClick(task, { toggle })
        }}
      >
        <span className="unscheduled-card__title">{task.title || '(untitled)'}</span>
        <span className="unscheduled-card__meta">
          <span
            className={`unscheduled-card__priority unscheduled-card__priority--${priority}`}
            title={priorityMeta.hint}
          >
            {priorityMeta.short}
          </span>
          <span className="unscheduled-card__hint">Drag to calendar</span>
        </span>
      </button>
    </div>
  )
}
