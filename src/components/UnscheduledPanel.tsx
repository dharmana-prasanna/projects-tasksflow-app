import { useDroppable } from '@dnd-kit/core'
import { BACKLOG_DROP_ID } from '../domain/unscheduled'
import type { ColoredTask, Task } from '../types'
import { UnscheduledTaskCard } from './UnscheduledTaskCard'

type Props = {
  tasks: ColoredTask[]
  onCreate: () => void
  onTaskClick: (task: Task) => void
}

/** Right-rail backlog of tasks with no date/time yet. */
export function UnscheduledPanel({ tasks, onCreate, onTaskClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: BACKLOG_DROP_ID,
    data: { backlog: true },
  })

  return (
    <aside
      ref={setNodeRef}
      className={[
        'unscheduled-panel',
        isOver ? 'unscheduled-panel--drop-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Unscheduled tasks"
    >
      <header className="unscheduled-panel__header">
        <div className="unscheduled-panel__heading">
          <h3 className="unscheduled-panel__title">Backlog</h3>
          <span
            className="field-help"
            title="Add tasks without a date, or drag calendar tasks here to unschedule them. Drag backlog cards onto a calendar slot to schedule."
            aria-label="Add tasks without a date, or drag calendar tasks here to unschedule them. Drag backlog cards onto a calendar slot to schedule."
          >
            ?
          </span>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--icon"
          onClick={onCreate}
          aria-label="Add unscheduled task"
          title="Add unscheduled task"
        >
          +
        </button>
      </header>

      {tasks.length === 0 ? (
        <p className="unscheduled-panel__empty">
          {isOver
            ? 'Drop to move this task to the backlog'
            : 'No unscheduled tasks. Add one, or drag a calendar task here.'}
        </p>
      ) : (
        <ul className="unscheduled-panel__list">
          {tasks.map((task) => (
            <li key={task.id}>
              <UnscheduledTaskCard task={task} onTaskClick={onTaskClick} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
