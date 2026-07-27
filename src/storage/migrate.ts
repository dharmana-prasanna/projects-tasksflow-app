import { FLOW_COLORS, PROJECT_COLORS, SAMPLE_STATE } from '../data/sample'
import {
  mergeLabelCatalog,
  normalizeLabelDefs,
  normalizeLabels,
} from '../domain/taskLabels'
import { normalizeMinute, singleDaySegment } from '../time'
import type {
  DaySegment,
  Dependency,
  Flow,
  Project,
  StoreState,
  Task,
} from '../types'

type LegacyTask = {
  id: string
  title: string
  date?: string
  hour?: number
  minute?: number
  notes?: string
  projectId?: string
  color?: string
  labels?: unknown
  segments?: DaySegment[]
}

type LegacyDep = {
  id: string
  fromId: string
  toId: string
  flowId?: string
}

function migrateTask(task: LegacyTask, fallbackProjectId: string, projectIds: Set<string>): Task {
  let projectId = task.projectId
  if (!projectId || !projectIds.has(projectId)) {
    projectId = fallbackProjectId
  }

  let segments: DaySegment[] = []
  if (Array.isArray(task.segments) && task.segments.length > 0) {
    segments = task.segments.map((s) =>
      singleDaySegment(
        s.date,
        s.startHour,
        normalizeMinute(s.startMinute),
        s.endHour,
        normalizeMinute(s.endMinute),
      ),
    )
  } else if (task.date != null && task.hour != null) {
    segments = [
      singleDaySegment(
        task.date,
        task.hour,
        normalizeMinute(task.minute),
      ),
    ]
  } else {
    segments = [singleDaySegment(SAMPLE_STATE.tasks[0].segments[0].date, 9, 0)]
  }

  return {
    id: task.id,
    title: task.title,
    notes: task.notes ?? '',
    projectId,
    labels: normalizeLabels(task.labels),
    segments,
  }
}

export function migrate(raw: unknown): StoreState | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as {
    projects?: Project[]
    flows?: Flow[]
    tasks?: LegacyTask[]
    dependencies?: LegacyDep[]
    labels?: unknown
  }
  if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.dependencies)) {
    return null
  }

  let projects = Array.isArray(parsed.projects) ? [...parsed.projects] : []

  if (projects.length === 0) {
    const byColor = new Map<string, string>()
    for (const task of parsed.tasks) {
      const color = task.color ?? PROJECT_COLORS[0]
      if (!byColor.has(color)) {
        const id = `proj-${byColor.size + 1}`
        byColor.set(color, id)
        projects.push({ id, name: `Project ${byColor.size}`, color })
      }
    }
    if (projects.length === 0) projects = structuredClone(SAMPLE_STATE.projects)
  }

  const fallbackProjectId = projects[0]?.id ?? SAMPLE_STATE.projects[0].id
  const projectIds = new Set(projects.map((p) => p.id))

  const tasks: Task[] = parsed.tasks.map((task) => {
    let projectId = task.projectId
    if (!projectId || !projectIds.has(projectId)) {
      if (task.color) {
        const match = projects.find((p) => p.color === task.color)
        projectId = match?.id ?? fallbackProjectId
      } else {
        projectId = fallbackProjectId
      }
    }
    return migrateTask({ ...task, projectId }, fallbackProjectId, projectIds)
  })

  let flows = Array.isArray(parsed.flows) ? [...parsed.flows] : []
  flows = flows.filter((f) => projectIds.has(f.projectId))

  for (const project of projects) {
    if (!flows.some((f) => f.projectId === project.id)) {
      flows.push({
        id: `flow-${project.id}`,
        name: 'Main flow',
        color: FLOW_COLORS[flows.length % FLOW_COLORS.length],
        projectId: project.id,
      })
    }
  }

  const flowIds = new Set(flows.map((f) => f.id))
  const defaultFlowByProject = new Map<string, string>()
  for (const f of flows) {
    if (!defaultFlowByProject.has(f.projectId)) {
      defaultFlowByProject.set(f.projectId, f.id)
    }
  }

  const taskProject = new Map(tasks.map((t) => [t.id, t.projectId]))

  const dependencies: Dependency[] = parsed.dependencies.map((dep) => {
    let flowId = dep.flowId
    if (!flowId || !flowIds.has(flowId)) {
      const fromProject = taskProject.get(dep.fromId) ?? fallbackProjectId
      flowId = defaultFlowByProject.get(fromProject) ?? flows[0].id
    }
    return {
      id: dep.id,
      fromId: dep.fromId,
      toId: dep.toId,
      flowId,
    }
  })

  const labels = mergeLabelCatalog(
    Array.isArray(parsed.labels) ? normalizeLabelDefs(parsed.labels) : [],
    tasks,
  )

  return { projects, flows, tasks, dependencies, labels }
}
