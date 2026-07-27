import { useDroppable } from '@dnd-kit/core'
import { useMemo } from 'react'
import {
  BACKLOG_DROP_ID,
  groupUnscheduledByLabel,
} from '../domain/unscheduled'
import type { ColoredTask, Task } from '../types'
import { UnscheduledTaskCard } from './UnscheduledTaskCard'

type Props = {
  tasks: ColoredTask[]
  hidden: boolean
  onToggleHidden: () => void
  onCreate: () => void
  onTaskClick: (task: Task) => void
}

/** Right-rail backlog of tasks with no date/time yet. */
export function UnscheduledPanel({
  tasks,
  hidden,
  onToggleHidden,
  onCreate,
  onTaskClick,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: BACKLOG_DROP_ID,
    data: { backlog: true },
  })

  const groups = useMemo(() => groupUnscheduledByLabel(tasks), [tasks])

  if (hidden) {
    return (
      <aside
        ref={setNodeRef}
        className={[
          'unscheduled-panel',
          'unscheduled-panel--collapsed',
          isOver ? 'unscheduled-panel--drop-target' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Unscheduled tasks (hidden)"
      >
        <button
          type="button"
          className="unscheduled-panel__reveal"
          onClick={onToggleHidden}
          title={
            isOver
              ? 'Drop to move to backlog, or click to show backlog'
              : `Show backlog (${tasks.length})`
          }
          aria-expanded={false}
        >
          <span className="unscheduled-panel__reveal-label">Backlog</span>
          <span className="unscheduled-panel__reveal-count">{tasks.length}</span>
        </button>
      </aside>
    )
  }

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
            title="Grouped by label. Drag calendar tasks here to unschedule, or drag cards onto the board to schedule. Hide with ▹ to widen the board."
            aria-label="Grouped by label. Drag calendar tasks here to unschedule, or drag cards onto the board to schedule."
          >
            ?
          </span>
        </div>
        <div className="unscheduled-panel__actions">
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onToggleHidden}
            aria-label="Hide backlog"
            title="Hide backlog"
            aria-expanded={true}
          >
            ▹
          </button>
          <button
            type="button"
            className="btn btn--primary btn--icon"
            onClick={onCreate}
            aria-label="Add unscheduled task"
            title="Add unscheduled task"
          >
            +
          </button>
        </div>
      </header>

      {tasks.length === 0 ? (
        <p className="unscheduled-panel__empty">
          {isOver
            ? 'Drop to move this task to the backlog'
            : 'No unscheduled tasks. Add one, or drag a calendar task here.'}
        </p>
      ) : (
        <div className="unscheduled-panel__scroll">
          {groups.map((group) => (
            <section
              key={group.key}
              className="unscheduled-panel__group"
              aria-label={`${group.label}, ${group.tasks.length} tasks`}
            >
              <h4 className="unscheduled-panel__group-title">
                <span>{group.label}</span>
                <span className="unscheduled-panel__group-count">
                  {group.tasks.length}
                </span>
              </h4>
              <ul className="unscheduled-panel__list">
                {group.tasks.map((task) => (
                  <li key={`${group.key}-${task.id}`}>
                    <UnscheduledTaskCard
                      task={task}
                      groupKey={group.key}
                      onTaskClick={onTaskClick}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}
