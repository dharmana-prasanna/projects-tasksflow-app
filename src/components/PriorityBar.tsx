import {
  PRIORITY_META,
  UI_PRIORITIES,
  uiPriority,
  type TaskPriority,
} from '../domain/taskPriority'
import type { Task } from '../types'

type Props = {
  tasks: Task[]
  selected: TaskPriority | 'all'
  onSelect: (priority: TaskPriority | 'all') => void
}

/** Compact priority filter: DoNow / Schedule / Delegate. */
export function PriorityBar({ tasks, selected, onSelect }: Props) {
  const selectedUi = selected === 'all' ? 'all' : uiPriority(selected)

  return (
    <div className="priority-bar">
      <div
        className="priority-bar__filters"
        role="group"
        aria-label="Filter by priority"
      >
        <button
          type="button"
          className={`priority-chip${selectedUi === 'all' ? ' priority-chip--active' : ''}`}
          onClick={() => onSelect('all')}
          aria-pressed={selectedUi === 'all'}
        >
          All
        </button>
        {UI_PRIORITIES.map((id) => {
          const meta = PRIORITY_META[id]
          const count = tasks.filter((t) => uiPriority(t.priority) === id).length
          const active = selectedUi === id
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
