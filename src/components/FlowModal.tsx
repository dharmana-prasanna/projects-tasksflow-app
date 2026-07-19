import { useEffect, useId, useState } from 'react'
import { FLOW_COLORS } from '../data/sample'
import type { Flow, Project } from '../types'

type Props = {
  open: boolean
  initial: Partial<Flow> | null
  projects: Project[]
  onClose: () => void
  onSave: (flow: Flow) => void
  onDelete?: (flowId: string) => void
  canDelete?: boolean
}

export function FlowModal({
  open,
  initial,
  projects,
  onClose,
  onSave,
  onDelete,
  canDelete = true,
}: Props) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [color, setColor] = useState(FLOW_COLORS[0])
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')

  useEffect(() => {
    if (!open || !initial) return
    setName(initial.name ?? '')
    setColor(initial.color ?? FLOW_COLORS[0])
    setProjectId(initial.projectId ?? projects[0]?.id ?? '')
  }, [open, initial, projects])

  if (!open || !initial) return null

  const isEdit = Boolean(initial.id)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !projectId) return
    onSave({
      id: initial!.id ?? crypto.randomUUID(),
      name: name.trim(),
      color,
      projectId,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id={titleId}>{isEdit ? 'Edit flow' : 'New flow'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form className="modal__form" onSubmit={handleSubmit}>
          <label>
            Flow name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              placeholder="e.g. Pipeline, Branch, Ops chain"
            />
          </label>

          <label>
            Project
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              disabled={isEdit}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="color-field">
            <legend>Arrow color for this flow</legend>
            <div className="color-swatches">
              {FLOW_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch${color === c ? ' swatch--active' : ''}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </fieldset>

          <p className="modal__tip">
            Drag → between tasks in this project while the flow is selected to add
            colored dependency arrows.
          </p>

          <div className="modal__actions">
            {isEdit && onDelete && initial.id && canDelete && (
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => onDelete(initial.id!)}
              >
                Delete
              </button>
            )}
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
