import { taskMatchesLabelFilter } from '../domain/taskLabels'
import type { Task } from '../types'

type Props = {
  selected: string[]
  tasks: Task[]
  onClear: () => void
  onOpenTask: (taskId: string) => void
}

/**
 * Always-visible matching-task list when a label filter is active
 * (chrome may be minimized, so LabelBar alone is not enough).
 */
export function LabelFilterBanner({
  selected,
  tasks,
  onClear,
  onOpenTask,
}: Props) {
  if (selected.length === 0) return null

  const matching = tasks.filter((t) => taskMatchesLabelFilter(t, selected))
  const labelText = selected.join(', ')

  return (
    <section className="label-filter-banner" aria-live="polite">
      <div className="label-filter-banner__head">
        <p className="label-filter-banner__title">
          Labels: <strong>{labelText}</strong>
        </p>
        <button type="button" className="btn btn--ghost" onClick={onClear}>
          Clear
        </button>
      </div>
      {matching.length === 0 ? (
        <p className="label-bar__hint">No tasks with these labels.</p>
      ) : (
        <ul className="label-bar__task-list">
          {matching.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="label-bar__task-link"
                onClick={() => onOpenTask(t.id)}
              >
                {t.title || '(untitled)'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
