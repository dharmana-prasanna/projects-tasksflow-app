import { countTasksWithLabel } from '../domain/taskLabels'
import type { LabelDef, Task } from '../types'

type Props = {
  labels: LabelDef[]
  tasks: Task[]
  selected: string[]
  onSelect: (label: string) => void
  onClear: () => void
  onDelete: (label: string) => void
}

/** Label chips to filter the board/graph/backlog (AND across selected labels). */
export function LabelBar({
  labels,
  tasks,
  selected,
  onSelect,
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

  return (
    <div className="label-bar">
      <div className="label-bar__heading">
        <span className="label-bar__title">Labels</span>
        <span
          className="field-help"
          title="Click labels to multi-select (AND — task must have all). Click again to deselect. × deletes a label only when no tasks use it."
          aria-label="Click labels to multi-select with AND. Click again to deselect. × deletes a label only when no tasks use it."
        >
          ?
        </span>
      </div>
      <div className="label-bar__filters" role="group" aria-label="Filter by label">
        <button
          type="button"
          className={`label-chip${selected.length === 0 ? ' label-chip--active' : ''}`}
          onClick={onClear}
          aria-pressed={selected.length === 0}
        >
          All labels
        </button>
        {labels.map((def) => {
          const label = def.name
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
                onClick={() => onSelect(label)}
                aria-pressed={active}
                title={
                  count === 0
                    ? `${label} (unused — safe to delete)`
                    : active
                      ? `Remove “${label}” from filter (${count} task${count === 1 ? '' : 's'})`
                      : `Add “${label}” to filter (${count} task${count === 1 ? '' : 's'})`
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
    </div>
  )
}
