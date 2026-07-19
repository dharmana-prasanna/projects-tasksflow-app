import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'

type Props = {
  date: string
  hour: number
  minute: number
  selected?: boolean
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
  children: ReactNode
}

export function DroppableCell({
  date,
  hour,
  minute,
  selected = false,
  onPointerDown,
  children,
}: Props) {
  const id = `${date}@${hour}:${minute}`
  const { setNodeRef, isOver, active } = useDroppable({
    id,
    data: { date, hour, minute },
  })

  return (
    <div
      ref={setNodeRef}
      className={[
        'board__cell',
        minute === 0 ? 'board__cell--hour' : 'board__cell--sub',
        active ? 'board__cell--targetable' : '',
        isOver ? 'board__cell--drop' : '',
        selected ? 'board__cell--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-cell-date={date}
      data-cell-hour={String(hour)}
      data-cell-minute={String(minute)}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  )
}
