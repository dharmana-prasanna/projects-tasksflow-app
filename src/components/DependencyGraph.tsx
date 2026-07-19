import { useId, useMemo, useRef, useState } from 'react'
import { clampGraphCurve, routeGraphEdge } from '../domain/arrowGeometry'
import {
  daysWithTasks,
  layoutDependencyGraph,
  taskColumnDate,
} from '../domain/graphLayout'
import {
  loadGraphBends,
  loadGraphCurve,
  saveGraphBends,
  saveGraphCurve,
  type GraphBendMap,
} from '../graphCurvePrefs'
import { formatSlot, primarySegment } from '../time'
import type { ColoredTask } from '../types'
import type { ColoredDependency } from './DependencyArrows'

const MUTED = '#9aa7b2'

type Props = {
  tasks: ColoredTask[]
  dependencies: ColoredDependency[]
  activeFlowId?: string | null
  onTaskClick: (task: ColoredTask) => void
  onRemoveDependency: (dependencyId: string) => void
}

function markerSafeId(prefix: string, raw: string) {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/** Dependency graph in day columns — no time rows; only days with tasks. */
export function DependencyGraph({
  tasks,
  dependencies,
  activeFlowId = null,
  onTaskClick,
  onRemoveDependency,
}: Props) {
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [curve, setCurve] = useState(loadGraphCurve)
  const [bends, setBends] = useState<GraphBendMap>(loadGraphBends)
  const bendsRef = useRef(bends)
  bendsRef.current = bends
  const dragRef = useRef<{
    edgeId: string
    pointerId: number
    startClientX: number
    startClientY: number
    /** Bend at drag start (control-point offset). */
    origin: { x: number; y: number }
  } | null>(null)

  const layout = useMemo(() => {
    const dayColumns = daysWithTasks(tasks)
    const nodes = tasks
      .map((t) => {
        const date = taskColumnDate(t)
        if (!date) return null
        const seg =
          t.segments.find((s) => s.date === date) ?? primarySegment(t)
        return {
          id: t.id,
          title: t.title,
          color: t.color,
          date,
          startHour: seg.startHour,
          startMinute: seg.startMinute,
          endHour: seg.endHour,
          endMinute: seg.endMinute,
        }
      })
      .filter((n): n is NonNullable<typeof n> => Boolean(n))

    const edges = dependencies.map((d) => {
      const muted = Boolean(activeFlowId && d.flowId !== activeFlowId)
      return {
        id: d.id,
        fromId: d.fromId,
        toId: d.toId,
        color: muted ? MUTED : d.color,
        muted,
      }
    })
    return layoutDependencyGraph(nodes, edges, { dayColumns })
  }, [tasks, dependencies, activeFlowId])

  const colors = [...new Set(layout.edges.map((e) => e.color))]

  const obstacles = useMemo(
    () =>
      layout.nodes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      })),
    [layout.nodes],
  )

  const paintedEdges = useMemo(
    () =>
      layout.edges.map((edge) => {
        const bend = bends[edge.id] ?? { x: 0, y: 0 }
        const path = routeGraphEdge(
          edge.x1,
          edge.y1,
          edge.x2,
          edge.y2,
          obstacles,
          new Set([edge.fromId, edge.toId]),
          curve,
          bend,
        )
        return { edge, ...path }
      }),
    [layout.edges, obstacles, bends, curve],
  )

  function onCurveChange(next: number) {
    const clamped = clampGraphCurve(next)
    setCurve(clamped)
    saveGraphCurve(clamped)
  }

  function resetBends() {
    setBends({})
    saveGraphBends({})
  }

  function clientToSvg(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: clientX, y: clientY }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: clientX, y: clientY }
    const local = pt.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }

  function startBendDrag(
    edgeId: string,
    e: React.PointerEvent<SVGCircleElement>,
  ) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const origin = bends[edgeId] ?? { x: 0, y: 0 }
    dragRef.current = {
      edgeId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origin,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onBendMove(e: React.PointerEvent) {
    const s = dragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    const a = clientToSvg(s.startClientX, s.startClientY)
    const b = clientToSvg(e.clientX, e.clientY)
    // Handle sits on the curve at t=0.5; B(0.5) moves half as far as the
    // control point, so scale drag ×2 to keep the circle under the pointer.
    const next = {
      ...bendsRef.current,
      [s.edgeId]: {
        x: s.origin.x + 2 * (b.x - a.x),
        y: s.origin.y + 2 * (b.y - a.y),
      },
    }
    bendsRef.current = next
    setBends(next)
  }

  function onBendEnd(e: React.PointerEvent) {
    const s = dragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    dragRef.current = null
    saveGraphBends(bendsRef.current)
  }

  if (tasks.length === 0 || layout.columns.length === 0) {
    return (
      <div className="graph-view graph-view--empty">
        <p>
          {tasks.length === 0
            ? 'No tasks in this filter. Create a task or choose another project.'
            : 'No scheduled days yet. Add dates to tasks to see day columns.'}
        </p>
      </div>
    )
  }

  return (
    <div className="graph-view" aria-label="Dependency graph by day">
      <div className="graph-view__toolbar">
        <label className="graph-curve">
          <span>Bend when blocked</span>
          <input
            type="range"
            min={0.15}
            max={2}
            step={0.05}
            value={curve}
            onChange={(e) => onCurveChange(Number(e.target.value))}
            aria-valuemin={0.15}
            aria-valuemax={2}
            aria-valuenow={curve}
            aria-label="How far arrows bend when they would cross a task"
          />
          <span className="graph-curve__value">{curve.toFixed(2)}</span>
        </label>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={resetBends}
          title="Reset manually dragged arrow bends"
        >
          Reset bends
        </button>
        <span className="graph-view__tip">
          Straight by default · bend only over other tasks · drag a handle to
          fine-tune
        </span>
      </div>
      <div className="graph-view__scroll">
        <svg
          ref={svgRef}
          className="graph-view__svg"
          width={layout.width}
          height={layout.height}
          role="img"
          onPointerMove={onBendMove}
          onPointerUp={onBendEnd}
          onPointerCancel={onBendEnd}
        >
          <title>Task dependency graph by day</title>
          <defs>
            {colors.map((color) => {
              const id = markerSafeId(`g-arrow-${uid}`, color)
              return (
                <marker
                  key={id}
                  id={id}
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L10,5 L0,10 Z" fill={color} />
                </marker>
              )
            })}
          </defs>

          {/* Day bands + headers (bottom layer) */}
          {layout.columns.map((col) => (
            <g key={col.date} className="graph-day">
              <rect
                className="graph-day__band"
                x={col.x - 8}
                y={0}
                width={col.width + 16}
                height={layout.height}
              />
              <text
                className="graph-day__name"
                x={col.x + col.width / 2}
                y={18}
                textAnchor="middle"
              >
                {col.labelName}
              </text>
              <text
                className="graph-day__date"
                x={col.x + col.width / 2}
                y={36}
                textAnchor="middle"
              >
                {col.labelDate}
              </text>
            </g>
          ))}

          {/* Task cards under arrows so curves stay visible */}
          {layout.nodes.map((node) => (
            <g
              key={node.id}
              className="graph-node"
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => {
                const task = tasks.find((t) => t.id === node.id)
                if (task) onTaskClick(task)
              }}
            >
              <rect
                className="graph-node__card"
                width={node.width}
                height={node.height}
                rx={10}
                ry={10}
                style={{ ['--task-color' as string]: node.color }}
              />
              <text
                className="graph-node__title"
                x={12}
                y={22}
                dominantBaseline="middle"
              >
                {node.title.length > 22
                  ? `${node.title.slice(0, 21)}…`
                  : node.title}
              </text>
              <text
                className="graph-node__time graph-node__time--start"
                x={12}
                y={node.height - 10}
              >
                {formatSlot(node.startHour, node.startMinute)}
              </text>
              <text
                className="graph-node__time graph-node__time--end"
                x={node.width - 12}
                y={node.height - 10}
                textAnchor="end"
              >
                {formatSlot(node.endHour, node.endMinute)}
              </text>
              <title>
                {node.title} · {formatSlot(node.startHour, node.startMinute)}–
                {formatSlot(node.endHour, node.endMinute)}
              </title>
            </g>
          ))}

          {/* Edges + bend handles on top */}
          {paintedEdges.map(({ edge, d, hx, hy, bent }) => {
            const markerId = markerSafeId(`g-arrow-${uid}`, edge.color)
            const showHandle = !edge.muted && (bent || Boolean(bends[edge.id]))
            return (
              <g
                key={edge.id}
                className={`graph-edge${edge.muted ? ' graph-edge--muted' : ''}${bent ? ' graph-edge--bent' : ''}`}
              >
                {bent && (
                  <path className="graph-edge__under" d={d} fill="none" />
                )}
                <path
                  className="graph-edge__hit"
                  d={d}
                  fill="none"
                  onClick={() => {
                    if (!edge.muted) onRemoveDependency(edge.id)
                  }}
                />
                <path
                  className="graph-edge__line"
                  d={d}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={edge.muted ? 1.75 : 2.75}
                  opacity={edge.muted ? 0.35 : 1}
                  markerEnd={`url(#${markerId})`}
                />
                {showHandle && (
                  <circle
                    className="graph-edge__handle"
                    cx={hx}
                    cy={hy}
                    r={7}
                    onPointerDown={(e) => startBendDrag(edge.id, e)}
                  >
                    <title>Drag to adjust bend</title>
                  </circle>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {dependencies.length === 0 && (
        <p className="graph-view__note">
          No dependency links yet. Open a task to pick dependents, or link from
          Board.
        </p>
      )}
    </div>
  )
}
