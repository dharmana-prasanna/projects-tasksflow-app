import type { Flow, Project } from '../types'

type Props = {
  flows: Flow[]
  projects: Project[]
  activeFlowId: string | null
  projectFilter: string | 'all'
  onSelectFlow: (flowId: string) => void
  onNewFlow: () => void
  onEditFlow: (flow: Flow) => void
}

export function FlowBar({
  flows,
  projects,
  activeFlowId,
  projectFilter,
  onSelectFlow,
  onNewFlow,
  onEditFlow,
}: Props) {
  const visibleFlows =
    projectFilter === 'all'
      ? flows
      : flows.filter((f) => f.projectId === projectFilter)

  const projectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name ?? 'Project'

  return (
    <div className="flow-bar">
      <div className="flow-bar__label">Flows</div>
      <div className="flow-bar__filters" role="tablist" aria-label="Active flow for new arrows">
        {visibleFlows.length === 0 ? (
          <span className="flow-bar__empty">No flows yet — create one to draw arrows.</span>
        ) : (
          visibleFlows.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={activeFlowId === f.id}
              className={`flow-chip${activeFlowId === f.id ? ' flow-chip--active' : ''}`}
              style={
                {
                  ['--flow-color' as string]: f.color,
                } as React.CSSProperties
              }
              onClick={() => onSelectFlow(f.id)}
              onDoubleClick={() => onEditFlow(f)}
              title={`${f.name} · ${projectName(f.projectId)} — click to draw with this flow`}
            >
              <span className="flow-chip__swatch" />
              <span className="flow-chip__name">{f.name}</span>
              {projectFilter === 'all' && (
                <span className="flow-chip__project">{projectName(f.projectId)}</span>
              )}
            </button>
          ))
        )}
      </div>
      <div className="flow-bar__actions">
        {activeFlowId && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              const f = flows.find((x) => x.id === activeFlowId)
              if (f) onEditFlow(f)
            }}
          >
            Edit flow
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onNewFlow}>
          + Flow
        </button>
      </div>
    </div>
  )
}
