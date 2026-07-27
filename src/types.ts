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

export type Task = {
  id: string
  title: string
  notes: string
  projectId: string
  /** Free-form tags (normalized); used for filtering. */
  labels: string[]
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

export type StoreState = {
  projects: Project[]
  flows: Flow[]
  tasks: Task[]
  dependencies: Dependency[]
}

export type InteractionMode = 'select' | 'link'
