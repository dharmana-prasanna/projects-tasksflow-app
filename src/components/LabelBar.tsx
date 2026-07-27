type Props = {
  labels: string[]
  selected: string[]
  onToggle: (label: string) => void
  onClear: () => void
}

/** Multi-select chips to filter the board/graph by task labels. */
export function LabelBar({ labels, selected, onToggle, onClear }: Props) {
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
          return (
            <button
              key={label}
              type="button"
              className={`label-chip${active ? ' label-chip--active' : ''}`}
              onClick={() => onToggle(label)}
              aria-pressed={active}
            >
              {label}
            </button>
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
