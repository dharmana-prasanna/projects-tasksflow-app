import { useEffect, useId, useState } from 'react'
import { PROJECT_COLORS } from '../data/sample'
import type { Project } from '../types'

type Props = {
  open: boolean
  initial: Partial<Project> | null
  onClose: () => void
  onSave: (project: Project) => void
  onDelete?: (projectId: string) => void
  canDelete?: boolean
}

export function ProjectModal({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
  canDelete = true,
}: Props) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])

  useEffect(() => {
    if (!open || !initial) return
    setName(initial.name ?? '')
    setColor(initial.color ?? PROJECT_COLORS[0])
  }, [open, initial])

  if (!open || !initial) return null

  const isEdit = Boolean(initial.id)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      id: initial!.id ?? crypto.randomUUID(),
      name: name.trim(),
      color,
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
          <h2 id={titleId}>{isEdit ? 'Edit project' : 'New project'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form className="modal__form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              placeholder="Project name"
            />
          </label>

          <fieldset className="color-field">
            <legend>Color — all tasks in this project use it</legend>
            <div className="color-swatches">
              {PROJECT_COLORS.map((c) => (
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
