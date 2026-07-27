import type { ColoredTask, Task } from '../types'
import { UnscheduledTaskCard } from './UnscheduledTaskCard'

type Props = {
  tasks: ColoredTask[]
  onCreate: () => void
  onTaskClick: (task: Task) => void
}

/** Right-rail backlog of tasks with no date/time yet. */
export function UnscheduledPanel({ tasks, onCreate, onTaskClick }: Props) {
  return (
    <aside className="unscheduled-panel" aria-label="Unscheduled tasks">
      <header className="unscheduled-panel__header">
        <div className="unscheduled-panel__heading">
          <h3 className="unscheduled-panel__title">Backlog</h3>
          <span
            className="field-help"
            title="Add tasks without a date. Drag them onto a calendar slot to schedule — they leave this list once scheduled."
            aria-label="Add tasks without a date. Drag them onto a calendar slot to schedule — they leave this list once scheduled."
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
          No unscheduled tasks. Add one, then drag it onto the board.
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
