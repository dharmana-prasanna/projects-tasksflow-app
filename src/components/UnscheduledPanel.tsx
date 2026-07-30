import { useDroppable } from '@dnd-kit/core'
import { useMemo } from 'react'
import { BACKLOG_DROP_ID, sortUnscheduledTasks } from '../domain/unscheduled'
import type { ColoredTask, Task, TaskActivateOptions } from '../types'
import { UnscheduledTaskCard } from './UnscheduledTaskCard'

type Props = {
  tasks: ColoredTask[]
  hidden: boolean
  onToggleHidden: () => void
  onCreate: () => void
  selectedTaskIds?: string[]
  onTaskClick: (task: Task, options?: TaskActivateOptions) => void
}

/** Right-rail backlog of tasks with no date/time yet. */
export function UnscheduledPanel({
  tasks,
  hidden,
  onToggleHidden,
  onCreate,
  selectedTaskIds = [],
  onTaskClick,
}: Props) {
  const selectionActive = selectedTaskIds.length > 0
  const selectedSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])
  const { setNodeRef, isOver } = useDroppable({
    id: BACKLOG_DROP_ID,
    data: { backlog: true },
  })

  const ordered = useMemo(() => sortUnscheduledTasks(tasks), [tasks])

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
            title="Each task once, sorted by priority then title. Labels show on the card. Drag calendar tasks here to unschedule, or drag cards onto the board to schedule. Hide with ▹ to widen the board."
            aria-label="Each task once, sorted by priority then title. Drag calendar tasks here to unschedule, or drag cards onto the board to schedule."
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
          <ul className="unscheduled-panel__list">
            {ordered.map((task) => (
              <li key={task.id}>
                <UnscheduledTaskCard
                  task={task}
                  selected={selectedSet.has(task.id)}
                  selectionActive={selectionActive}
                  onTaskClick={onTaskClick}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
