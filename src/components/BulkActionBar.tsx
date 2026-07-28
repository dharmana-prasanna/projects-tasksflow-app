import { useMemo, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { normalizeLabel } from '../domain/taskLabels'

type Props = {
  count: number
  knownLabels: string[]
  onMoveToDate: (date: string) => void
  onAddLabel: (label: string) => void
  onRemoveLabel: (label: string) => void
  onClear: () => void
}

/** Floating toolbar for multi-selected tasks. */
export function BulkActionBar({
  count,
  knownLabels,
  onMoveToDate,
  onAddLabel,
  onRemoveLabel,
  onClear,
}: Props) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [labelDraft, setLabelDraft] = useState('')
  const listId = useMemo(
    () => `bulk-label-list-${Math.random().toString(36).slice(2, 8)}`,
    [],
  )

  function commitLabel(mode: 'add' | 'remove') {
    const label = normalizeLabel(labelDraft)
    if (!label) return
    if (mode === 'add') onAddLabel(label)
    else onRemoveLabel(label)
    setLabelDraft('')
  }

  function handleMove(e: FormEvent) {
    e.preventDefault()
    if (!date) return
    onMoveToDate(date)
  }

  return (
    <div className="bulk-bar" role="region" aria-label="Selected tasks">
      <span className="bulk-bar__count">
        {count} selected
      </span>

      <form className="bulk-bar__group" onSubmit={handleMove}>
        <label className="bulk-bar__label" htmlFor="bulk-move-date">
          Move to
        </label>
        <input
          id="bulk-move-date"
          className="bulk-bar__input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--small">
          Move
        </button>
      </form>

      <div className="bulk-bar__group">
        <label className="bulk-bar__label" htmlFor="bulk-label">
          Label
        </label>
        <input
          id="bulk-label"
          className="bulk-bar__input bulk-bar__input--label"
          type="text"
          list={listId}
          value={labelDraft}
          placeholder="name"
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitLabel('add')
            }
          }}
        />
        <datalist id={listId}>
          {knownLabels.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => commitLabel('add')}
        >
          Add
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => commitLabel('remove')}
        >
          Remove
        </button>
      </div>

      <button
        type="button"
        className="btn btn--ghost btn--small bulk-bar__clear"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  )
}
