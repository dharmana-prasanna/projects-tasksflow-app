import { format, parseISO } from 'date-fns'
import { useEffect, useId, useMemo, useState } from 'react'
import {
  addTaskLabel,
  labelNames,
  normalizeLabel,
  normalizeLabels,
  removeTaskLabel,
} from '../domain/taskLabels'
import {
  DEFAULT_TASK_PRIORITY,
  normalizePriority,
  PRIORITY_META,
  priorityLabel,
  UI_PRIORITIES,
  uiPriority,
} from '../domain/taskPriority'
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
import type {
  DaySegment,
  Dependency,
  Flow,
  LabelDef,
  Project,
  Task,
  TaskPriority,
} from '../types'

export type TaskSavePayload = {
  task: Task
  /** Desired dependents (toIds) on the active flow for this task as fromId. */
  dependentIds: string[]
  flowId: string | null
  /** Descriptions for labels on this task (catalog upsert). */
  labelMeta: LabelDef[]
}

export type TaskSaveOptions = {
  /** When false, keep the modal open (nested edit). Default true. */
  close?: boolean
}

/** Snapshot of the task editor form for nested navigation. */
export type FormFrame = {
  taskId: string | undefined
  title: string
  notes: string
  projectId: string
  startDate: string
  endDate: string
  segments: DaySegment[]
  dependentIds: string[]
  dependentQuery: string
  dependentPriority: TaskPriority | 'all'
  labels: string[]
  labelDraft: string
  priority: TaskPriority
  unscheduled: boolean
}

type Props = {
  open: boolean
  initial: Partial<Task> | null
  projects: Project[]
  tasks: Task[]
  labelCatalog: LabelDef[]
  dependencies: Dependency[]
  flows: Flow[]
  activeFlowId: string | null
  onClose: () => void
  onSave: (payload: TaskSavePayload, options?: TaskSaveOptions) => void
  onDelete?: (taskId: string, options?: TaskSaveOptions) => void
  /** Click a label chip to list matching tasks on the board. */
  onShowLabel?: (label: string) => void
}

function loadScheduleFields(source: Partial<Task>): Pick<
  FormFrame,
  'unscheduled' | 'segments' | 'startDate' | 'endDate'
> {
  const explicitEmpty =
    Array.isArray(source.segments) && source.segments.length === 0
  if (explicitEmpty) {
    return { unscheduled: true, segments: [], startDate: '', endDate: '' }
  }
  const segs =
    source.segments && source.segments.length > 0
      ? source.segments.map(normalizeSegment)
      : [
          {
            date: format(new Date(), 'yyyy-MM-dd'),
            startHour: 9,
            startMinute: 0,
            endHour: 9,
            endMinute: 15,
          },
        ]
  const sorted = [...segs].sort((a, b) => a.date.localeCompare(b.date))
  return {
    unscheduled: false,
    segments: sorted,
    startDate: sorted[0].date,
    endDate: sorted[sorted.length - 1].date,
  }
}

export function TaskModal({
  open,
  initial,
  projects,
  tasks,
  labelCatalog,
  dependencies,
  flows,
  activeFlowId,
  onClose,
  onSave,
  onDelete,
  onShowLabel,
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
  const [dependentPriority, setDependentPriority] = useState<
    TaskPriority | 'all'
  >('all')
  const [labels, setLabels] = useState<string[]>([])
  const [labelDraft, setLabelDraft] = useState('')
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_TASK_PRIORITY)
  const [unscheduled, setUnscheduled] = useState(false)
  /** Previous form frames when drilling into a related task. */
  const [frameStack, setFrameStack] = useState<FormFrame[]>([])
  /** Task id currently in the form (may differ from root `initial` when nested). */
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>()

  const activeFlow = activeFlowId
    ? flows.find((f) => f.id === activeFlowId)
    : undefined

  const knownLabels = useMemo(() => labelNames(labelCatalog), [labelCatalog])
  const isNested = frameStack.length > 0

  function captureFrame(): FormFrame {
    return {
      taskId: editingTaskId,
      title,
      notes,
      projectId,
      startDate,
      endDate,
      segments,
      dependentIds,
      dependentQuery,
      dependentPriority,
      labels,
      labelDraft,
      priority,
      unscheduled,
    }
  }

  function applyFrame(frame: FormFrame) {
    setEditingTaskId(frame.taskId)
    setTitle(frame.title)
    setNotes(frame.notes)
    setProjectId(frame.projectId)
    setStartDate(frame.startDate)
    setEndDate(frame.endDate)
    setSegments(frame.segments)
    setDependentIds(frame.dependentIds)
    setDependentQuery(frame.dependentQuery)
    setDependentPriority(frame.dependentPriority)
    setLabels(frame.labels)
    setLabelDraft(frame.labelDraft)
    setPriority(frame.priority)
    setUnscheduled(frame.unscheduled)
  }

  function loadFromTask(source: Partial<Task>) {
    setEditingTaskId(source.id)
    setTitle(source.title ?? '')
    setNotes(source.notes ?? '')
    setProjectId(source.projectId ?? projects[0]?.id ?? '')
    setDependentQuery('')
    setDependentPriority('all')
    setLabels(normalizeLabels(source.labels))
    setLabelDraft('')
    setPriority(normalizePriority(source.priority))
    const schedule = loadScheduleFields(source)
    setUnscheduled(schedule.unscheduled)
    setSegments(schedule.segments)
    setStartDate(schedule.startDate)
    setEndDate(schedule.endDate)
    if (source.id && activeFlowId) {
      setDependentIds(
        currentDependentIds(dependencies, source.id, activeFlowId).sort(),
      )
    } else {
      setDependentIds([])
    }
  }

  function goBack(removeDependentId?: string) {
    if (frameStack.length === 0) return
    const frame = frameStack[frameStack.length - 1]
    const restored =
      removeDependentId != null
        ? {
            ...frame,
            dependentIds: frame.dependentIds.filter(
              (id) => id !== removeDependentId,
            ),
          }
        : frame
    setFrameStack((prev) => prev.slice(0, -1))
    applyFrame(restored)
  }

  function openRelatedTask(taskId: string) {
    const target = tasks.find((t) => t.id === taskId)
    if (!target) return
    setFrameStack((prev) => [...prev, captureFrame()])
    loadFromTask(target)
  }

  function requestClose() {
    if (isNested) {
      goBack()
      return
    }
    onClose()
  }

  useEffect(() => {
    if (!open || !initial) return
    setFrameStack([])
    loadFromTask(initial)
    // Root open / switch only — nested navigation is local.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open, initial])

  const selected = projects.find((p) => p.id === projectId)
  const multiDay = segments.length > 1
  const candidates = useMemo(
    () => eligibleDependentTasks(tasks, editingTaskId),
    [tasks, editingTaskId],
  )
  const visibleCandidates = useMemo(
    () => filterDependentTasks(candidates, dependentQuery, dependentPriority),
    [candidates, dependentQuery, dependentPriority],
  )

  const rangeLabel = useMemo(() => {
    if (!startDate || !endDate) return ''
    if (startDate === endDate) return format(parseISO(startDate), 'MMM d, yyyy')
    return `${format(parseISO(startDate), 'MMM d')} – ${format(parseISO(endDate), 'MMM d, yyyy')}`
  }, [startDate, endDate])

  if (!open || !initial) return null

  const isEdit = Boolean(editingTaskId)

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

  function commitLabelDraft() {
    const name = normalizeLabel(labelDraft.replace(/,$/, ''))
    if (!name) return
    setLabels((prev) => addTaskLabel(prev, name))
    setLabelDraft('')
  }

  function setBacklogMode(next: boolean) {
    setUnscheduled(next)
    if (next) {
      setSegments([])
      setStartDate('')
      setEndDate('')
      return
    }
    const today = format(new Date(), 'yyyy-MM-dd')
    const seg = {
      date: today,
      startHour: 9,
      startMinute: 0,
      endHour: 9,
      endMinute: 15,
    }
    setSegments([seg])
    setStartDate(today)
    setEndDate(today)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !projectId) return
    if (!unscheduled && segments.length === 0) return
    const normalized = normalizeLabels(labels)
    const task: Task = {
      id: editingTaskId ?? crypto.randomUUID(),
      title: title.trim(),
      notes: notes.trim(),
      projectId,
      labels: normalized,
      priority: normalizePriority(priority),
      segments: unscheduled ? [] : segments.map(normalizeSegment),
    }
    const labelMeta: LabelDef[] = normalized.map((name) => ({
      name,
      description: '',
    }))
    const nested = frameStack.length > 0
    onSave(
      {
        task,
        dependentIds,
        flowId: activeFlowId,
        labelMeta,
      },
      { close: !nested },
    )
    if (nested) goBack()
  }

  function handleDelete() {
    if (!editingTaskId || !onDelete) return
    const nested = frameStack.length > 0
    const deletedId = editingTaskId
    onDelete(deletedId, { close: !nested })
    if (nested) goBack(deletedId)
  }

  return (
    <div className="modal-backdrop" onClick={requestClose} role="presentation">
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <div className="modal__header-title">
            {isNested && (
              <button
                type="button"
                className="btn btn--ghost modal__back"
                onClick={() => goBack()}
              >
                ← Back
              </button>
            )}
            <h2 id={titleId}>{isEdit ? 'Edit task' : 'New task'}</h2>
          </div>
          <div className="modal__header-actions">
            {isEdit && onDelete && editingTaskId && (
              <button
                type="button"
                className="btn btn--danger btn--header-delete"
                onClick={handleDelete}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={requestClose}
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

          <fieldset className="task-priority">
            <legend className="task-priority__legend">Priority</legend>
            <div
              className="task-priority__options"
              role="radiogroup"
              aria-label="Task priority"
            >
              {UI_PRIORITIES.map((id) => {
                const meta = PRIORITY_META[id]
                const active = uiPriority(priority) === id
                return (
                  <label
                    key={id}
                    className={`task-priority__option task-priority__option--${id}${
                      active ? ' task-priority__option--active' : ''
                    }`}
                    title={meta.hint}
                  >
                    <input
                      type="radio"
                      name="task-priority"
                      value={id}
                      checked={active}
                      onChange={() => setPriority(id)}
                    />
                    <span className="task-priority__short">{meta.short}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="task-labels">
            <legend className="task-labels__legend">
              Labels
              <span
                className="field-help"
                title="Click a label to list matching tasks on the board. Use × to unlink from this task only — that does not delete the label."
                aria-label="Click a label to list matching tasks on the board. Use × to unlink from this task only — that does not delete the label."
              >
                ?
              </span>
            </legend>
            {labels.length > 0 && (
              <div className="task-labels__chips" aria-label="Task labels">
                {labels.map((label) => (
                  <span
                    key={label}
                    className="label-chip-wrap label-chip-wrap--static"
                  >
                    <button
                      type="button"
                      className="label-chip label-chip--removable"
                      onClick={() => onShowLabel?.(label)}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      className="label-chip__delete"
                      onClick={() =>
                        setLabels((prev) => removeTaskLabel(prev, label))
                      }
                      title={`Remove “${label}” from this task`}
                      aria-label={`Remove ${label} from this task`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="task-labels__add">
              <input
                type="text"
                value={labelDraft}
                list="flowboard-known-labels"
                placeholder="e.g. travel, kids"
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    commitLabelDraft()
                  }
                }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={commitLabelDraft}
              >
                Add
              </button>
            </div>
            <datalist id="flowboard-known-labels">
              {knownLabels.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </fieldset>

          <label className="task-backlog-toggle">
            <input
              type="checkbox"
              checked={unscheduled}
              onChange={(e) => setBacklogMode(e.target.checked)}
            />
            <span>
              Backlog only — no date/time (drag onto the calendar later)
            </span>
          </label>

          {!unscheduled && (
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
          )}

          {!unscheduled && (
          <p className="modal__tip">
            {multiDay
              ? `Multi-day · ${rangeLabel}. Set start/end time for each day below.`
              : `Single day · ${rangeLabel}.`}
          </p>
          )}

          {!unscheduled && !multiDay && segments[0] && (
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

          {!unscheduled && multiDay && (
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
                  depend on this one (creates arrows this → selected). Click a
                  title to edit that task, then return here.
                </p>
                <div className="dependents__filters">
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
                  <div
                    className="dependents__priority"
                    role="group"
                    aria-label="Filter dependents by priority"
                  >
                    <button
                      type="button"
                      className={`priority-chip${
                        dependentPriority === 'all'
                          ? ' priority-chip--active'
                          : ''
                      }`}
                      onClick={() => setDependentPriority('all')}
                      aria-pressed={dependentPriority === 'all'}
                    >
                      All
                    </button>
                    {UI_PRIORITIES.map((id) => {
                      const meta = PRIORITY_META[id]
                      const active = dependentPriority === id
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`priority-chip priority-chip--${id}${
                            active ? ' priority-chip--active' : ''
                          }`}
                          onClick={() => setDependentPriority(id)}
                          aria-pressed={active}
                          title={meta.hint}
                        >
                          {meta.short}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {visibleCandidates.length === 0 ? (
                  <p className="modal__tip">
                    No tasks match
                    {dependentQuery.trim()
                      ? ` “${dependentQuery.trim()}”`
                      : ''}
                    {dependentPriority !== 'all'
                      ? `${dependentQuery.trim() ? ' ·' : ''} ${priorityLabel(dependentPriority)}`
                      : ''}
                    .
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
                      const prio = uiPriority(normalizePriority(t.priority))
                      return (
                        <div key={t.id} className="dependents__item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDependentIds((prev) => toggleId(prev, t.id))
                            }
                            aria-label={`Link ${t.title} as dependent`}
                          />
                          <span
                            className="project-dot"
                            style={{ background: project?.color ?? '#999' }}
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="dependents__title"
                            onClick={() => openRelatedTask(t.id)}
                            title={`Edit “${t.title}”`}
                          >
                            {t.title}
                          </button>
                          <span
                            className={`dependents__priority-tag dependents__priority-tag--${prio}`}
                            title={PRIORITY_META[prio].hint}
                          >
                            {PRIORITY_META[prio].short}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </fieldset>

          <div className="modal__actions">
            <div className="modal__actions-right">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={requestClose}
              >
                {isNested ? 'Back' : 'Cancel'}
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
