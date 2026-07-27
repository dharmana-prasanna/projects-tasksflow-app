import {
  countTasksWithLabel,
  taskMatchesLabelFilter,
} from '../domain/taskLabels'
import type { Task } from '../types'

type Props = {
  labels: string[]
  tasks: Task[]
  selected: string[]
  onToggle: (label: string) => void
  onClear: () => void
  onDelete: (label: string) => void
}

/** Multi-select chips to filter the board/graph by task labels. */
export function LabelBar({
  labels,
  tasks,
  selected,
  onToggle,
  onClear,
  onDelete,
}: Props) {
  if (labels.length === 0) {
    return (
      <div className="label-bar label-bar--empty">
        <span className="label-bar__hint">
          No labels yet — add them when editing a task.
        </span>
      </div>
    )
  }

  const matchingTasks =
    selected.length === 0
      ? []
      : tasks.filter((t) => taskMatchesLabelFilter(t, selected))

  return (
    <div className="label-bar">
      <div className="label-bar__filters" role="group" aria-label="Filter by label">
        <button
          type="button"
          className={`label-chip${selected.length === 0 ? ' label-chip--active' : ''}`}
          onClick={onClear}
          aria-pressed={selected.length === 0}
        >
          All labels
        </button>
        {labels.map((label) => {
          const active = selected.some(
            (s) => s.toLowerCase() === label.toLowerCase(),
          )
          const count = countTasksWithLabel(tasks, label)
          const unused = count === 0
          return (
            <span
              key={label}
              className={`label-chip-wrap${active ? ' label-chip-wrap--active' : ''}`}
            >
              <button
                type="button"
                className={`label-chip${active ? ' label-chip--active' : ''}`}
                onClick={() => onToggle(label)}
                aria-pressed={active}
                title={
                  count === 0
                    ? `${label} (unused — safe to delete)`
                    : `Show ${count} task${count === 1 ? '' : 's'} with “${label}”`
                }
              >
                {label}
                <span className="label-chip__count">{count}</span>
              </button>
              <button
                type="button"
                className="label-chip__delete"
                onClick={() => onDelete(label)}
                title={
                  unused
                    ? `Delete unused label “${label}”`
                    : `Cannot delete “${label}” — ${count} task${count === 1 ? '' : 's'} still use it`
                }
                aria-label={
                  unused
                    ? `Delete label ${label}`
                    : `Cannot delete ${label}; ${count} tasks still use it`
                }
              >
                ×
              </button>
            </span>
          )
        })}
      </div>
      {selected.length > 0 && (
        <button type="button" className="btn btn--ghost" onClick={onClear}>
          Clear labels
        </button>
      )}
      {selected.length > 0 && (
        <div className="label-bar__matches" aria-live="polite">
          {matchingTasks.length === 0 ? (
            <p className="label-bar__hint">
              No tasks match the selected label
              {selected.length > 1 ? 's' : ''}.
            </p>
          ) : (
            <>
              <p className="label-bar__hint">
                {matchingTasks.length} task
                {matchingTasks.length === 1 ? '' : 's'} with selected label
                {selected.length > 1 ? 's' : ''}:
              </p>
              <ul className="label-bar__task-list">
                {matchingTasks.map((t) => (
                  <li key={t.id}>{t.title || '(untitled)'}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
