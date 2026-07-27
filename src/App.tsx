import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  isNarrowViewport,
  loadChromeMinimized,
  saveChromeMinimized,
} from './chromePrefs'
import { CalendarGrid } from './components/CalendarGrid'
import { ChromePanel } from './components/ChromePanel'
import { LabelBar } from './components/LabelBar'
import { LabelFilterBanner } from './components/LabelFilterBanner'
import type { ColoredDependency } from './components/DependencyArrows'
import { DependencyGraph } from './components/DependencyGraph'
import { FlowBar } from './components/FlowBar'
import { FlowModal } from './components/FlowModal'
import { ProjectBar } from './components/ProjectBar'
import { ProjectModal } from './components/ProjectModal'
import { StorageModal } from './components/StorageModal'
import { TaskModal } from './components/TaskModal'
import { FLOW_COLORS, PROJECT_COLORS } from './data/sample'
import {
  mergeLabelCatalog,
  selectLabelFilter,
  taskMatchesLabelFilter,
} from './domain/taskLabels'
import {
  filterScheduledTasks,
  filterUnscheduledTasks,
  isTaskUnscheduled,
} from './domain/unscheduled'
import { planDependentSync } from './domain/taskDependents'
import { useTaskStore } from './hooks/useTaskStore'
import { singleDaySegment } from './time'
import type { ColoredTask, Flow, Project, Task } from './types'
import { loadMainView, saveMainView, type MainView } from './viewPrefs'

const DAY_SPANS = [1, 3, 7, 10, 15, 30, 60, 90, 180, 365] as const

type AppProps = {
  /** When set (password gate on), show Lock in the topbar. */
  onLock?: () => void
}

export default function App({ onLock }: AppProps) {
  const {
    projects,
    flows,
    tasks,
    dependencies,
    labels: labelCatalog,
    upsertProject,
    deleteProject,
    upsertFlow,
    deleteFlow,
    upsertTask,
    deleteTask,
    registerLabels,
    deleteLabel,
    addDependency,
    removeDependency,
    resetSample,
    sheetsUrl,
    calendarSync,
    syncStatus,
    syncError,
    updatedAt,
    connectSheets,
    disconnectSheets,
    setCalendarSync,
    pullFromSheets,
    pushToSheets,
    deleteInvalidTasks,
  } = useTaskStore()

  const [mainView, setMainView] = useState<MainView>(loadMainView)
  const [daySpan, setDaySpan] = useState<(typeof DAY_SPANS)[number]>(7)
  const [cursor, setCursor] = useState(() => parseISO('2026-07-20'))
  const [projectFilter, setProjectFilter] = useState<string | 'all'>('all')
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [chromeMinimized, setChromeMinimized] = useState(loadChromeMinimized)

  // Phones: start with projects/flows collapsed so the calendar gets the screen.
  useEffect(() => {
    if (isNarrowViewport()) setChromeMinimized(true)
  }, [])

  function selectMainView(view: MainView) {
    setMainView(view)
    saveMainView(view)
  }
  const [toast, setToast] = useState<string | null>(null)
  const [storageOpen, setStorageOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null)
  const [editingProject, setEditingProject] = useState<Partial<Project> | null>(null)
  const [editingFlow, setEditingFlow] = useState<Partial<Flow> | null>(null)

  function toggleChromeMinimized() {
    setChromeMinimized((prev) => {
      const next = !prev
      saveChromeMinimized(next)
      return next
    })
  }

  // Keep active flow valid when filters/data change
  useEffect(() => {
    const visible =
      projectFilter === 'all'
        ? flows
        : flows.filter((f) => f.projectId === projectFilter)
    if (visible.length === 0) {
      setActiveFlowId(null)
      return
    }
    if (!activeFlowId || !visible.some((f) => f.id === activeFlowId)) {
      setActiveFlowId(visible[0].id)
    }
  }, [flows, projectFilter, activeFlowId])

  const projectColor = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.color]))
    return (projectId: string) => map.get(projectId) ?? PROJECT_COLORS[0]
  }, [projects])

  const flowById = useMemo(() => new Map(flows.map((f) => [f.id, f])), [flows])

  const coloredTasks: ColoredTask[] = useMemo(
    () =>
      tasks.map((t) => ({
        ...t,
        color: projectColor(t.projectId),
      })),
    [tasks, projectColor],
  )

  const allLabels = useMemo(
    () => mergeLabelCatalog(labelCatalog, tasks),
    [labelCatalog, tasks],
  )

  const visibleTasks = useMemo(() => {
    const byProject =
      projectFilter === 'all'
        ? coloredTasks
        : coloredTasks.filter((t) => t.projectId === projectFilter)
    return byProject.filter((t) => taskMatchesLabelFilter(t, labelFilter))
  }, [coloredTasks, projectFilter, labelFilter])

  const scheduledTasks = useMemo(
    () => filterScheduledTasks(visibleTasks),
    [visibleTasks],
  )

  const unscheduledTasks = useMemo(
    () => filterUnscheduledTasks(visibleTasks),
    [visibleTasks],
  )

  const visibleDependencies: ColoredDependency[] = useMemo(() => {
    const ids = new Set(visibleTasks.map((t) => t.id))
    return dependencies
      .filter((d) => ids.has(d.fromId) && ids.has(d.toId))
      .map((d) => {
        const flow = flowById.get(d.flowId)
        return {
          ...d,
          color: flow?.color ?? '#0b3d91',
          flowName: flow?.name,
        }
      })
  }, [dependencies, visibleTasks, flowById])

  const activeFlow = activeFlowId ? flowById.get(activeFlowId) : undefined

  const chromeSummary = useMemo(() => {
    const projectLabel =
      projectFilter === 'all'
        ? 'All projects'
        : (projects.find((p) => p.id === projectFilter)?.name ?? 'Project')
    const flowProject = activeFlow
      ? projects.find((p) => p.id === activeFlow.projectId)?.name
      : undefined
    const flowLabel = activeFlow
      ? flowProject
        ? `${activeFlow.name} · ${flowProject}`
        : activeFlow.name
      : 'No flow selected'
    const labelsLabel =
      labelFilter.length === 0
        ? 'All labels'
        : labelFilter.length === 1
          ? labelFilter[0]
          : `${labelFilter.length} labels`
    return `${projectLabel} · ${flowLabel} · ${labelsLabel}`
  }, [projectFilter, projects, activeFlow, labelFilter])

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: cursor,
        end: addDays(cursor, daySpan - 1),
      }).map((d) => format(d, 'yyyy-MM-dd')),
    [cursor, daySpan],
  )

  const rangeLabel = useMemo(() => {
    if (daySpan === 1) return format(cursor, 'EEEE, MMM d, yyyy')
    const end = addDays(cursor, daySpan - 1)
    return `${format(cursor, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  }, [cursor, daySpan])

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2400)
  }

  function showTasksForLabel(label: string) {
    setLabelFilter(selectLabelFilter(label))
    if (chromeMinimized) {
      setChromeMinimized(false)
      saveChromeMinimized(false)
    }
    setEditingTask(null)
    const count = tasks.filter((t) =>
      taskMatchesLabelFilter(t, selectLabelFilter(label)),
    ).length
    showToast(
      count === 0
        ? `No tasks with “${label}” yet`
        : `${count} task${count === 1 ? '' : 's'} with “${label}”`,
    )
  }

  function defaultProjectId() {
    if (projectFilter !== 'all') return projectFilter
    if (activeFlow) return activeFlow.projectId
    return projects[0]?.id ?? ''
  }

  function handleCreateTask(range: {
    date: string
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number
  }) {
    setEditingTask({
      title: '',
      notes: '',
      projectId: defaultProjectId(),
      labels: [],
      segments: [
        singleDaySegment(
          range.date,
          range.startHour,
          range.startMinute,
          range.endHour,
          range.endMinute,
        ),
      ],
    })
  }

  const handleMoveTask = useCallback(
    (task: Task) => {
      const wasBacklog = tasks.some(
        (t) => t.id === task.id && isTaskUnscheduled(t),
      )
      upsertTask(task)
      showToast(
        wasBacklog
          ? `Scheduled “${task.title}” from backlog`
          : `Moved “${task.title}”`,
      )
    },
    [upsertTask, tasks],
  )

  function handleCreateUnscheduled() {
    setEditingTask({
      title: '',
      notes: '',
      projectId: defaultProjectId(),
      labels: [],
      segments: [],
    })
  }

  const handleLinkTasks = useCallback(
    (fromId: string, toId: string) => {
      if (!activeFlowId) {
        showToast('Select a flow before drawing arrows.')
        return
      }
      const from = tasks.find((t) => t.id === fromId)
      const to = tasks.find((t) => t.id === toId)
      const flow = flows.find((f) => f.id === activeFlowId)
      const result = addDependency(fromId, toId, activeFlowId)
      if (!result.ok) showToast(result.reason)
      else
        showToast(
          `Linked ${from?.title ?? 'task'} → ${to?.title ?? 'task'} on “${flow?.name ?? 'flow'}”`,
        )
    },
    [tasks, flows, activeFlowId, addDependency],
  )

  const canDeleteEditingFlow = Boolean(
    editingFlow?.id &&
      flows.filter((f) => f.projectId === editingFlow.projectId).length > 1,
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <h1 className="brand__name">Flowboard</h1>
            <p className="brand__tag">Projects, flows, and dependencies</p>
          </div>
        </div>

        <div className="topbar__controls">
          <div className="topbar__row topbar__row--primary">
            <div className="view-switch" role="tablist" aria-label="Main view">
              <button
                type="button"
                role="tab"
                aria-selected={mainView === 'board'}
                className={`view-switch__btn${mainView === 'board' ? ' view-switch__btn--active' : ''}`}
                onClick={() => selectMainView('board')}
              >
                Board
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainView === 'graph'}
                className={`view-switch__btn${mainView === 'graph' ? ' view-switch__btn--active' : ''}`}
                onClick={() => selectMainView('graph')}
              >
                Graph
              </button>
            </div>

            <div className="topbar__actions">
              <span className="link-count topbar__optional" title="Visible dependency arrows">
                {visibleDependencies.length} link
                {visibleDependencies.length === 1 ? '' : 's'}
              </span>

              {onLock && (
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  onClick={onLock}
                  title="Lock Flowboard"
                  aria-label="Lock Flowboard"
                >
                  Lock
                </button>
              )}

              <button
                type="button"
                className="btn btn--ghost sync-btn btn--icon"
                onClick={() => setStorageOpen(true)}
                title={syncError ?? 'Google Sheets sync'}
                aria-label="Sheets sync"
              >
                <span className={`sync-dot sync-dot--${syncStatus}`} aria-hidden="true" />
                <span className="btn__full">
                  {syncStatus === 'local-only'
                    ? 'Local'
                    : syncStatus === 'saving'
                      ? 'Saving…'
                      : syncStatus === 'loading'
                        ? 'Loading…'
                        : syncStatus === 'error'
                          ? 'Sync error'
                          : 'Sheets'}
                </span>
              </button>

              <button
                type="button"
                className="btn btn--primary btn--icon"
                onClick={() =>
                  setEditingTask({
                    title: '',
                    notes: '',
                    projectId: defaultProjectId(),
                    labels: [],
                    segments: [singleDaySegment(days[0], 9, 0)],
                  })
                }
                aria-label="New task"
              >
                <span className="btn__full">+ New task</span>
                <span className="btn__short" aria-hidden="true">
                  +
                </span>
              </button>

              <button
                type="button"
                className="btn btn--ghost topbar__optional"
                onClick={() => {
                  resetSample()
                  setDaySpan(7)
                  setProjectFilter('all')
                  setLabelFilter([])
                  setActiveFlowId(null)
                  setCursor(parseISO('2026-07-20'))
                  showToast(
                    sheetsUrl
                      ? 'Sample board restored (will sync to Sheets)'
                      : 'Sample board restored',
                  )
                }}
              >
                Reset sample
              </button>
            </div>
          </div>

          {mainView === 'board' && (
            <div className="topbar__row topbar__row--nav">
              <div
                className="view-switch view-switch--days"
                role="tablist"
                aria-label="Number of days"
              >
                {DAY_SPANS.map((span) => (
                  <button
                    key={span}
                    type="button"
                    role="tab"
                    aria-selected={daySpan === span}
                    className={`view-switch__btn${daySpan === span ? ' view-switch__btn--active' : ''}`}
                    onClick={() => setDaySpan(span)}
                  >
                    {span}d
                  </button>
                ))}
              </div>

              <label className="day-span-select">
                <span className="day-span-select__label">Days</span>
                <select
                  aria-label="Number of days"
                  value={daySpan}
                  onChange={(e) =>
                    setDaySpan(Number(e.target.value) as (typeof DAY_SPANS)[number])
                  }
                >
                  {DAY_SPANS.map((span) => (
                    <option key={span} value={span}>
                      {span}d
                    </option>
                  ))}
                </select>
              </label>

              <div className="week-nav">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setCursor((d) => addDays(d, -daySpan))}
                  aria-label="Previous range"
                >
                  ←
                </button>
                <span className="week-label">{rangeLabel}</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setCursor((d) => addDays(d, daySpan))}
                  aria-label="Next range"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <ChromePanel
        minimized={chromeMinimized}
        onToggle={toggleChromeMinimized}
        summary={chromeSummary}
      >
        <ProjectBar
          projects={projects}
          selectedProjectId={projectFilter}
          onSelect={setProjectFilter}
          onNewProject={() =>
            setEditingProject({
              name: '',
              color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
            })
          }
          onEditProject={(p) => setEditingProject(p)}
        />

        <LabelBar
          labels={allLabels}
          tasks={tasks}
          selected={labelFilter}
          onSelect={showTasksForLabel}
          onClear={() => setLabelFilter([])}
          onDelete={(label) => {
            const result = deleteLabel(label)
            if (!result.ok) {
              showTasksForLabel(label)
              showToast(result.reason)
              return
            }
            setLabelFilter((prev) =>
              prev.filter((s) => s.toLowerCase() !== label.toLowerCase()),
            )
            showToast(`Deleted label “${label}”`)
          }}
        />

        <FlowBar
          flows={flows}
          projects={projects}
          activeFlowId={activeFlowId}
          projectFilter={projectFilter}
          onSelectFlow={setActiveFlowId}
          onNewFlow={() =>
            setEditingFlow({
              name: '',
              color: FLOW_COLORS[flows.length % FLOW_COLORS.length],
              projectId: defaultProjectId(),
            })
          }
          onEditFlow={(f) => setEditingFlow(f)}
        />

        <p className="hint">
          {mainView === 'board' ? (
            <>
              Drag across empty 15‑minute cells to set a task’s start/end, or click
              one cell for a 1‑hour default. Select a <strong>flow</strong>, then
              drag → to link tasks.
            </>
          ) : (
            <>
              Graph shows day columns (only days with tasks) and dependency
              arrows — no time rows. Click a task to edit or pick dependents.
            </>
          )}
        </p>
      </ChromePanel>

      <LabelFilterBanner
        selected={labelFilter}
        tasks={tasks}
        onClear={() => setLabelFilter([])}
        onOpenTask={(taskId) => {
          const task = tasks.find((t) => t.id === taskId)
          if (task) setEditingTask(task)
        }}
      />

      {mainView === 'board' ? (
        <CalendarGrid
          days={days}
          tasks={scheduledTasks}
          unscheduledTasks={unscheduledTasks}
          dependencies={visibleDependencies}
          activeFlowColor={activeFlow?.color}
          activeFlowId={activeFlowId}
          onCreateTask={handleCreateTask}
          onCreateUnscheduled={handleCreateUnscheduled}
          onTaskClick={(task) => setEditingTask(task)}
          onMoveTask={handleMoveTask}
          onLinkTasks={handleLinkTasks}
          onRemoveDependency={(id) => {
            removeDependency(id)
            showToast('Dependency removed')
          }}
        />
      ) : (
        <DependencyGraph
          tasks={scheduledTasks}
          dependencies={visibleDependencies}
          activeFlowId={activeFlowId}
          onTaskClick={(task) => setEditingTask(task)}
          onRemoveDependency={(id) => {
            removeDependency(id)
            showToast('Dependency removed')
          }}
        />
      )}

      <TaskModal
        open={Boolean(editingTask)}
        initial={editingTask}
        projects={projects}
        tasks={tasks}
        labelCatalog={allLabels}
        dependencies={dependencies}
        flows={flows}
        activeFlowId={activeFlowId}
        onClose={() => setEditingTask(null)}
        onShowLabel={showTasksForLabel}
        onSave={({ task, dependentIds, flowId, labelMeta }) => {
          upsertTask(task)
          registerLabels(labelMeta)
          let linkNote = ''
          if (flowId) {
            const plan = planDependentSync(
              task.id,
              flowId,
              dependentIds,
              dependencies,
            )
            let added = 0
            let removed = 0
            let failed = 0
            for (const toId of plan.toAdd) {
              const result = addDependency(task.id, toId, flowId)
              if (result.ok) added += 1
              else failed += 1
            }
            for (const depId of plan.toRemoveIds) {
              removeDependency(depId)
              removed += 1
            }
            if (added || removed || failed) {
              const parts: string[] = []
              if (added) parts.push(`${added} link${added === 1 ? '' : 's'} added`)
              if (removed)
                parts.push(`${removed} link${removed === 1 ? '' : 's'} removed`)
              if (failed) parts.push(`${failed} skipped`)
              linkNote = ` · ${parts.join(', ')}`
            }
          }
          setEditingTask(null)
          showToast(
            `${editingTask?.id ? 'Task updated' : 'Task created'}${linkNote}`,
          )
        }}
        onDelete={(id) => {
          deleteTask(id)
          setEditingTask(null)
          showToast('Task deleted')
        }}
      />

      <ProjectModal
        open={Boolean(editingProject)}
        initial={editingProject}
        canDelete={projects.length > 1}
        onClose={() => setEditingProject(null)}
        onSave={(project) => {
          upsertProject(project)
          setEditingProject(null)
          showToast(editingProject?.id ? 'Project updated' : 'Project created')
        }}
        onDelete={(id) => {
          const result = deleteProject(id)
          if (!result.ok) {
            showToast(result.reason)
            return
          }
          if (projectFilter === id) setProjectFilter('all')
          setEditingProject(null)
          showToast('Project deleted')
        }}
      />

      <FlowModal
        open={Boolean(editingFlow)}
        initial={editingFlow}
        projects={projects}
        canDelete={canDeleteEditingFlow}
        onClose={() => setEditingFlow(null)}
        onSave={(flow) => {
          upsertFlow(flow)
          setActiveFlowId(flow.id)
          setEditingFlow(null)
          showToast(editingFlow?.id ? 'Flow updated' : 'Flow created')
        }}
        onDelete={(id) => {
          const result = deleteFlow(id)
          if (!result.ok) {
            showToast(result.reason)
            return
          }
          if (activeFlowId === id) setActiveFlowId(null)
          setEditingFlow(null)
          showToast('Flow deleted — its arrows moved to another flow')
        }}
      />

      {storageOpen && (
        <StorageModal
          sheetsUrl={sheetsUrl}
          calendarSync={calendarSync}
          syncStatus={syncStatus}
          syncError={syncError}
          updatedAt={updatedAt}
          taskCount={tasks.length}
          onClose={() => setStorageOpen(false)}
          onConnect={connectSheets}
          onDisconnect={disconnectSheets}
          onSetCalendarSync={setCalendarSync}
          onPull={pullFromSheets}
          onPush={pushToSheets}
          onDeleteInvalidTasks={deleteInvalidTasks}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
