import {
  PRIORITY_META,
  TASK_PRIORITIES,
  type TaskPriority,
} from '../domain/taskPriority'
import type { Task } from '../types'

type Props = {
  tasks: Task[]
  selected: TaskPriority | 'all'
  onSelect: (priority: TaskPriority | 'all') => void
}

/** Eisenhower priority filter chips. */
export function PriorityBar({ tasks, selected, onSelect }: Props) {
  return (
    <div className="priority-bar">
      <div className="priority-bar__heading">
        <span className="priority-bar__title">Priority</span>
        <span
          className="field-help"
          title="Filter by Eisenhower quadrant: Q1 Do, Q2 Schedule, Q3 Delegate, Q4 Eliminate."
          aria-label="Filter by Eisenhower priority"
        >
          ?
        </span>
      </div>
      <div
        className="priority-bar__filters"
        role="group"
        aria-label="Filter by priority"
      >
        <button
          type="button"
          className={`priority-chip${selected === 'all' ? ' priority-chip--active' : ''}`}
          onClick={() => onSelect('all')}
          aria-pressed={selected === 'all'}
        >
          All
        </button>
        {TASK_PRIORITIES.map((id) => {
          const meta = PRIORITY_META[id]
          const count = tasks.filter((t) => t.priority === id).length
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              className={`priority-chip priority-chip--${id}${
                active ? ' priority-chip--active' : ''
              }`}
              onClick={() => onSelect(id)}
              aria-pressed={active}
              title={meta.hint}
            >
              {meta.short}
              <span className="priority-chip__count">{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
