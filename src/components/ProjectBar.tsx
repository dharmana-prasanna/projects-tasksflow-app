import type { Project } from '../types'

type Props = {
  projects: Project[]
  selectedProjectId: string | 'all'
  onSelect: (id: string | 'all') => void
  onNewProject: () => void
  onEditProject: (project: Project) => void
}

export function ProjectBar({
  projects,
  selectedProjectId,
  onSelect,
  onNewProject,
  onEditProject,
}: Props) {
  return (
    <div className="project-bar">
      <div className="project-bar__filters" role="tablist" aria-label="Filter by project">
        <button
          type="button"
          role="tab"
          aria-selected={selectedProjectId === 'all'}
          className={`project-chip${selectedProjectId === 'all' ? ' project-chip--active' : ''}`}
          onClick={() => onSelect('all')}
        >
          All projects
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={selectedProjectId === p.id}
            className={`project-chip${selectedProjectId === p.id ? ' project-chip--active' : ''}`}
            onClick={() => onSelect(p.id)}
            onDoubleClick={() => onEditProject(p)}
            title="Click to filter · double-click to edit"
          >
            <span className="project-dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="project-bar__actions">
        {selectedProjectId !== 'all' && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              const p = projects.find((x) => x.id === selectedProjectId)
              if (p) onEditProject(p)
            }}
          >
            Edit project
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onNewProject}>
          + Project
        </button>
      </div>
    </div>
  )
}
