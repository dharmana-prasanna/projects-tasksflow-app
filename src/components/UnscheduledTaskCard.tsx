import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef } from 'react'
import type { ColoredTask, Task } from '../types'

type Props = {
  task: ColoredTask
  onTaskClick: (task: Task) => void
}

/** Draggable backlog card — drop onto a calendar slot to schedule. */
export function UnscheduledTaskCard({ task, onTaskClick }: Props) {
  const dragged = useRef(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `${task.id}::unscheduled`,
      data: { task, unscheduled: true },
    })

  useEffect(() => {
    if (isDragging) dragged.current = true
  }, [isDragging])

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-task-id={task.id}
      className={[
        'unscheduled-card',
        isDragging ? 'unscheduled-card--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--task-color' as string]: task.color,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
      }}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false
          return
        }
        onTaskClick(task)
      }}
    >
      <span className="unscheduled-card__title">{task.title || '(untitled)'}</span>
      <span className="unscheduled-card__hint">Drag to calendar</span>
    </button>
  )
}
