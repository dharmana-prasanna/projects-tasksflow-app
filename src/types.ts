export type Project = {
  id: string
  name: string
  color: string
}

/** Named dependency path within a project — arrows share this color */
export type Flow = {
  id: string
  name: string
  color: string
  projectId: string
}

/** One day's occupancy for a task (supports multi-day with per-day times). */
export type DaySegment = {
  date: string // YYYY-MM-DD
  startHour: number // 0-23
  startMinute: number // 0 | 15 | 30 | 45
  endHour: number
  endMinute: number
}

/** Eisenhower Matrix priority (see domain/taskPriority). */
export type TaskPriority = 'q1' | 'q2' | 'q3' | 'q4'

export type Task = {
  id: string
  title: string
  notes: string
  projectId: string
  /** Free-form tags (normalized); used for filtering. */
  labels: string[]
  /**
   * Eisenhower priority: q1 DoNow · q2 Schedule · q3 Delegate
   * (legacy q4 maps to Delegate via normalizePriority)
   */
  priority: TaskPriority
  segments: DaySegment[]
}

/** Task with resolved project color for rendering */
export type ColoredTask = Task & { color: string }

export type Dependency = {
  id: string
  fromId: string
  toId: string
  flowId: string
}

/** Catalog entry for a reusable label name (description kept for forward compat). */
export type LabelDef = {
  name: string
  description: string
}

export type StoreState = {
  projects: Project[]
  flows: Flow[]
  tasks: Task[]
  dependencies: Dependency[]
  /**
   * Managed label catalog. Labels remain here after the last task unlinks
   * them so they can be deleted explicitly (only when unused).
   */
  labels: LabelDef[]
}

export type InteractionMode = 'select' | 'link'

/** Options when activating a task (open editor vs toggle multi-select). */
export type TaskActivateOptions = {
  toggle?: boolean
}
