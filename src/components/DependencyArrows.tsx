import { useId, useLayoutEffect, useState } from 'react'
import {
  dependencyPath,
  elementCenterInRoot,
} from '../domain/arrowGeometry'
import type { Dependency } from '../types'

export type ColoredDependency = Dependency & { color: string; flowName?: string }

const MUTED_ARROW = '#9aa7b2'

type Seg = {
  id: string
  flowId: string
  color: string
  flowName?: string
  muted: boolean
  x1: number
  y1: number
  x2: number
  y2: number
  mx: number
  my: number
}

export type DraftLink = {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

type Props = {
  dependencies: ColoredDependency[]
  layoutKey: string
  /** Content root (board canvas) — arrows are drawn in this element's coordinates. */
  containerRef: React.RefObject<HTMLElement | null>
  /** When set, arrows on other flows are greyed out */
  activeFlowId?: string | null
  interactive?: boolean
  draft?: DraftLink | null
  onRemove: (dependencyId: string) => void
}

function pickEl(root: ParentNode, taskId: string): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>(`[data-task-id="${taskId}"]`)
  if (!nodes.length) return null
  const real = Array.from(nodes).find(
    (el) => !el.classList.contains('offscreen-anchor'),
  )
  return real ?? nodes[0]
}

function markerSafeId(prefix: string, raw: string) {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

export function DependencyArrows({
  dependencies,
  layoutKey,
  containerRef,
  activeFlowId = null,
  interactive = true,
  draft = null,
  onRemove,
}: Props) {
  const uid = useId().replace(/:/g, '')
  const [segs, setSegs] = useState<Seg[]>([])

  useLayoutEffect(() => {
    let alive = true

    function measure() {
      if (!alive) return
      const root = containerRef.current
      if (!root) {
        setSegs([])
        return
      }
      const next: Seg[] = []

      for (const dep of dependencies) {
        const fromEl = pickEl(root, dep.fromId)
        const toEl = pickEl(root, dep.toId)
        if (!fromEl || !toEl) continue

        const a = elementCenterInRoot(fromEl, root)
        const b = elementCenterInRoot(toEl, root)
        if (a.w < 1 || b.w < 1) continue

        const muted = Boolean(activeFlowId && dep.flowId !== activeFlowId)
        next.push({
          id: dep.id,
          flowId: dep.flowId,
          color: muted ? MUTED_ARROW : dep.color,
          flowName: dep.flowName,
          muted,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
        })
      }

      next.sort((a, b) => Number(a.muted) - Number(b.muted))

      setSegs((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (p, i) =>
              p.id === next[i]?.id &&
              p.color === next[i]?.color &&
              p.muted === next[i]?.muted &&
              Math.abs(p.x1 - next[i].x1) < 0.5 &&
              Math.abs(p.y1 - next[i].y1) < 0.5 &&
              Math.abs(p.x2 - next[i].x2) < 0.5 &&
              Math.abs(p.y2 - next[i].y2) < 0.5,
          )
        ) {
          return prev
        }
        return next
      })
    }

    measure()
    const times = [0, 50, 120, 250, 500].map((ms) => window.setTimeout(measure, ms))

    window.addEventListener('resize', measure)
    const rootEl = containerRef.current
    const scrollEl = rootEl?.closest('.board-scroll')
    scrollEl?.addEventListener('scroll', measure, { passive: true })

    const ro =
      typeof ResizeObserver !== 'undefined' && rootEl
        ? new ResizeObserver(measure)
        : null
    if (rootEl) ro?.observe(rootEl)

    return () => {
      alive = false
      times.forEach(clearTimeout)
      window.removeEventListener('resize', measure)
      scrollEl?.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [dependencies, layoutKey, containerRef, activeFlowId])

  const colors = [...new Set(segs.map((s) => s.color))]
  if (draft?.color) colors.push(draft.color)

  return (
    <svg
      className={`dep-overlay${interactive ? '' : ' dep-overlay--inert'}`}
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        {colors.map((color) => {
          const id = markerSafeId(`arrow-${uid}`, color)
          return (
            <marker
              key={id}
              id={id}
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L12,6 L0,12 Z" fill={color} />
            </marker>
          )
        })}
      </defs>

      {segs.map((s) => {
        const d = dependencyPath(s.x1, s.y1, s.x2, s.y2)
        const markerId = markerSafeId(`arrow-${uid}`, s.color)
        return (
          <g
            key={s.id}
            className={`dep-group${s.muted ? ' dep-group--muted' : ' dep-group--active'}`}
          >
            <title>
              {s.flowName ?? 'Flow'}
              {s.muted ? ' (other flow)' : ''}
            </title>
            <path
              className="dep-hit"
              d={d}
              fill="none"
              onClick={() => {
                if (!s.muted) onRemove(s.id)
              }}
            />
            <path
              className="dep-line"
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.muted ? 2 : 3.25}
              opacity={s.muted ? 0.35 : 1}
              markerEnd={`url(#${markerId})`}
            />
            {!s.muted && (
              <>
                <circle
                  className="dep-delete"
                  cx={s.mx}
                  cy={s.my}
                  r="9"
                  stroke={s.color}
                  onClick={() => onRemove(s.id)}
                />
                <text
                  className="dep-delete-x"
                  x={s.mx}
                  y={s.my + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={s.color}
                  onClick={() => onRemove(s.id)}
                >
                  ×
                </text>
              </>
            )}
          </g>
        )
      })}

      {draft && (
        <path
          className="dep-line dep-line--draft"
          d={dependencyPath(draft.x1, draft.y1, draft.x2, draft.y2)}
          fill="none"
          stroke={draft.color}
          markerEnd={`url(#${markerSafeId(`arrow-${uid}`, draft.color)})`}
        />
      )}
    </svg>
  )
}
