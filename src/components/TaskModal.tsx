import { format, parseISO } from 'date-fns'
import { useEffect, useId, useMemo, useState } from 'react'
import {
  currentDependentIds,
  eligibleDependentTasks,
  filterDependentTasks,
  toggleId,
} from '../domain/taskDependents'
import {
  END_TIME_SLOTS,
  formatSlot,
  normalizeMinute,
  normalizeSegment,
  primarySegment,
  syncSegmentsForRange,
  TIME_SLOTS,
} from '../time'
import type { DaySegment, Dependency, Flow, Project, Task } from '../types'

export type TaskSavePayload = {
  task: Task
  /** Desired dependents (toIds) on the active flow for this task as fromId. */
  dependentIds: string[]
  flowId: string | null
}

type Props = {
  open: boolean
  initial: Partial<Task> | null
  projects: Project[]
  tasks: Task[]
  dependencies: Dependency[]
  flows: Flow[]
  activeFlowId: string | null
  onClose: () => void
  onSave: (payload: TaskSavePayload) => void
  onDelete?: (taskId: string) => void
}

export function TaskModal({
  open,
  initial,
  projects,
  tasks,
  dependencies,
  flows,
  activeFlowId,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const titleId = useId()
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [segments, setSegments] = useState<DaySegment[]>([])
  const [dependentIds, setDependentIds] = useState<string[]>([])
  const [dependentQuery, setDependentQuery] = useState('')

  const activeFlow = activeFlowId
    ? flows.find((f) => f.id === activeFlowId)
    : undefined

  useEffect(() => {
    if (!open || !initial) return
    setTitle(initial.title ?? '')
    setNotes(initial.notes ?? '')
    setProjectId(initial.projectId ?? projects[0]?.id ?? '')
    setDependentQuery('')

    const segs =
      initial.segments && initial.segments.length > 0
        ? initial.segments.map(normalizeSegment)
        : [
            {
              date: format(new Date(), 'yyyy-MM-dd'),
              startHour: 9,
              startMinute: 0,
              endHour: 10,
              endMinute: 0,
            },
          ]
    const sorted = [...segs].sort((a, b) => a.date.localeCompare(b.date))
    setSegments(sorted)
    setStartDate(sorted[0].date)
    setEndDate(sorted[sorted.length - 1].date)

    if (initial.id && activeFlowId) {
      setDependentIds(
        currentDependentIds(dependencies, initial.id, activeFlowId).sort(),
      )
    } else {
      setDependentIds([])
    }
  }, [open, initial, projects, dependencies, activeFlowId])

  const selected = projects.find((p) => p.id === projectId)
  const multiDay = segments.length > 1
  const candidates = useMemo(
    () => eligibleDependentTasks(tasks, initial?.id),
    [tasks, initial?.id],
  )
  const visibleCandidates = useMemo(
    () => filterDependentTasks(candidates, dependentQuery),
    [candidates, dependentQuery],
  )

  const rangeLabel = useMemo(() => {
    if (!startDate || !endDate) return ''
    if (startDate === endDate) return format(parseISO(startDate), 'MMM d, yyyy')
    return `${format(parseISO(startDate), 'MMM d')} – ${format(parseISO(endDate), 'MMM d, yyyy')}`
  }, [startDate, endDate])

  if (!open || !initial) return null

  const isEdit = Boolean(initial.id)

  function applyRange(nextStart: string, nextEnd: string, nextSegs?: DaySegment[]) {
    const start = nextStart
    const end = nextEnd < nextStart ? nextStart : nextEnd
    setStartDate(start)
    setEndDate(end)
    const base = nextSegs ?? segments
    const first = base[0] ?? primarySegment({ segments: base } as Task)
    const last = base[base.length - 1] ?? first
    setSegments(
      syncSegmentsForRange(
        base,
        start,
        end,
        { hour: first.startHour, minute: first.startMinute },
        { hour: last.endHour, minute: last.endMinute },
      ),
    )
  }

  function updateSegment(date: string, patch: Partial<DaySegment>) {
    setSegments((prev) =>
      prev.map((s) =>
        s.date === date ? normalizeSegment({ ...s, ...patch }) : s,
      ),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !projectId || segments.length === 0) return
    const task: Task = {
      id: initial!.id ?? crypto.randomUUID(),
      title: title.trim(),
      notes: notes.trim(),
      projectId,
      segments: segments.map(normalizeSegment),
    }
    onSave({
      task,
      dependentIds,
      flowId: activeFlowId,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id={titleId}>{isEdit ? 'Edit task' : 'New task'}</h2>
          <div className="modal__header-actions">
            {isEdit && onDelete && initial.id && (
              <button
                type="button"
                className="btn btn--danger btn--header-delete"
                onClick={() => onDelete(initial.id!)}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        <form className="modal__form" onSubmit={handleSubmit}>
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
              placeholder="What needs doing?"
            />
          </label>

          <label>
            Project
            <div className="project-select-row">
              <span
                className="project-dot"
                style={{ background: selected?.color ?? '#999' }}
                aria-hidden
              />
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <div className="modal__row">
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => applyRange(e.target.value, endDate)}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => applyRange(startDate, e.target.value)}
                required
              />
            </label>
          </div>

          <p className="modal__tip">
            {multiDay
              ? `Multi-day · ${rangeLabel}. Set start/end time for each day below.`
              : `Single day · ${rangeLabel}.`}
          </p>

          {!multiDay && segments[0] && (
            <div className="modal__row">
              <label>
                Start time
                <select
                  value={`${segments[0].startHour}:${segments[0].startMinute}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number)
                    updateSegment(segments[0].date, {
                      startHour: h,
                      startMinute: normalizeMinute(m),
                    })
                  }}
                >
                  {TIME_SLOTS.map((slot) => (
                    <option
                      key={`s-${slot.hour}:${slot.minute}`}
                      value={`${slot.hour}:${slot.minute}`}
                    >
                      {formatSlot(slot.hour, slot.minute)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                End time
                <select
                  value={`${segments[0].endHour}:${segments[0].endMinute}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number)
                    updateSegment(segments[0].date, {
                      endHour: h,
                      endMinute: h >= 24 ? 0 : normalizeMinute(m),
                    })
                  }}
                >
                  {END_TIME_SLOTS.map((slot) => (
                    <option
                      key={`e-${slot.hour}:${slot.minute}`}
                      value={`${slot.hour}:${slot.minute}`}
                    >
                      {formatSlot(slot.hour, slot.minute)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {multiDay && (
            <div className="day-times">
              <div className="day-times__head">
                <span>Day</span>
                <span>Start</span>
                <span>End</span>
              </div>
              {segments.map((seg) => (
                <div key={seg.date} className="day-times__row">
                  <span className="day-times__date">
                    {format(parseISO(seg.date), 'EEE M/d')}
                  </span>
                  <select
                    value={`${seg.startHour}:${seg.startMinute}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      updateSegment(seg.date, {
                        startHour: h,
                        startMinute: normalizeMinute(m),
                      })
                    }}
                    aria-label={`Start time ${seg.date}`}
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option
                        key={`${seg.date}-s-${slot.hour}:${slot.minute}`}
                        value={`${slot.hour}:${slot.minute}`}
                      >
                        {formatSlot(slot.hour, slot.minute)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={`${seg.endHour}:${seg.endMinute}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      updateSegment(seg.date, {
                        endHour: h,
                        endMinute: h >= 24 ? 0 : normalizeMinute(m),
                      })
                    }}
                    aria-label={`End time ${seg.date}`}
                  >
                    {END_TIME_SLOTS.map((slot) => (
                      <option
                        key={`${seg.date}-e-${slot.hour}:${slot.minute}`}
                        value={`${slot.hour}:${slot.minute}`}
                      >
                        {formatSlot(slot.hour, slot.minute)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <label>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional details"
            />
          </label>

          <fieldset className="dependents">
            <legend>Dependent tasks</legend>
            {!activeFlowId || !activeFlow ? (
              <p className="modal__tip">
                Select a <strong>flow</strong> in the bar above to link dependents
                on save.
              </p>
            ) : candidates.length === 0 ? (
              <p className="modal__tip">No other tasks available to link.</p>
            ) : (
              <>
                <p className="modal__tip">
                  On flow <strong>{activeFlow.name}</strong>, check tasks that
                  depend on this one (creates arrows this → selected).
                </p>
                <label className="dependents__search">
                  Search dependents
                  <input
                    type="search"
                    value={dependentQuery}
                    onChange={(e) => setDependentQuery(e.target.value)}
                    placeholder="Filter by title…"
                    autoComplete="off"
                  />
                </label>
                {visibleCandidates.length === 0 ? (
                  <p className="modal__tip">
                    No tasks match “{dependentQuery.trim()}”.
                  </p>
                ) : (
                  <div
                    className="dependents__list"
                    role="group"
                    aria-label="Select dependent tasks"
                  >
                    {visibleCandidates.map((t) => {
                      const checked = dependentIds.includes(t.id)
                      const project = projects.find((p) => p.id === t.projectId)
                      return (
                        <label key={t.id} className="dependents__item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDependentIds((prev) => toggleId(prev, t.id))
                            }
                          />
                          <span
                            className="project-dot"
                            style={{ background: project?.color ?? '#999' }}
                            aria-hidden
                          />
                          <span className="dependents__title">{t.title}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </fieldset>

          <div className="modal__actions">
            <div className="modal__actions-right">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
