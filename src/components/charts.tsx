import type { ComponentChildren } from 'preact'

const W = 300
const H = 140

function niceRange(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1]
  const pad = (max - min) * 0.12
  return [min - pad, max + pad]
}

/** Line chart with an optional goal line. x is any increasing number (ms or index). */
export function LineChart({ points, goal, fmtY, fmtX, height = 11, color = 'var(--accent)', empty }: { points: { x: number; y: number }[]; goal?: number; fmtY: (v: number) => string; fmtX: (x: number) => string; height?: number; color?: string; empty?: ComponentChildren }) {
  if (points.length === 0) return <div class="chart-empty muted small">{empty ?? 'No data yet'}</div>
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  if (goal != null) ys.push(goal)
  const [y0, y1] = niceRange(Math.min(...ys), Math.max(...ys))
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const sx = (x: number) => (x1 === x0 ? W / 2 : ((x - x0) / (x1 - x0)) * W)
  const sy = (y: number) => H - ((y - y0) / (y1 - y0)) * H
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join('')
  const area = `${d}L${sx(points[points.length - 1].x).toFixed(1)} ${H}L${sx(points[0].x).toFixed(1)} ${H}Z`
  const ticks = [y1 - (y1 - y0) * 0.1, (y0 + y1) / 2, y0 + (y1 - y0) * 0.1]
  return (
    <div class="chart" style={{ height: `${height}rem` }}>
      <div class="chart-y">
        {ticks.map((t) => (
          <span key={t} style={{ top: `${(sy(t) / H) * 100}%` }}>
            {fmtY(t)}
          </span>
        ))}
      </div>
      <div class="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
          {ticks.map((t) => (
            <line key={t} x1="0" x2={W} y1={sy(t)} y2={sy(t)} stroke="var(--line)" vector-effect="non-scaling-stroke" />
          ))}
          {goal != null && <line x1="0" x2={W} y1={sy(goal)} y2={sy(goal)} stroke="var(--good)" stroke-dasharray="4 4" stroke-width="1.5" vector-effect="non-scaling-stroke" />}
          <path d={area} fill={color} opacity="0.1" />
          <path d={d} fill="none" stroke={color} stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
        {points.length <= 40 &&
          points.map((p, i) => <i key={i} class="chart-dot" style={{ left: `${(sx(p.x) / W) * 100}%`, top: `${(sy(p.y) / H) * 100}%`, background: color }} />)}
        <div class="chart-x">
          <span>{fmtX(x0)}</span>
          {x1 !== x0 && <span>{fmtX(x1)}</span>}
        </div>
      </div>
    </div>
  )
}

/** Vertical bars, optional stacked segments and goal line. */
export function BarChart({ bars, goal, fmtY, height = 10, onPick, picked }: { bars: { label: string; parts: { v: number; color: string }[]; title?: string }[]; goal?: number; fmtY: (v: number) => string; height?: number; onPick?: (i: number) => void; picked?: number }) {
  const max = Math.max(goal ?? 0, ...bars.map((b) => b.parts.reduce((s, p) => s + Math.max(0, p.v), 0)), 1) * 1.1
  const showLabels = bars.length <= 14
  return (
    <div class="bars" style={{ height: `${height}rem` }}>
      <div class="bars-plot">
        {goal != null && goal > 0 && (
          <div class="bars-goal" style={{ bottom: `${(goal / max) * 100}%` }}>
            <span>{fmtY(goal)}</span>
          </div>
        )}
        {bars.map((b, i) => (
          <button key={i} type="button" class={`bars-col ${picked === i ? 'on' : ''}`} title={b.title} onClick={() => onPick?.(i)} aria-label={b.title ?? b.label}>
            <div class="bars-stack">
              {b.parts.map((p, j) => (
                <i key={j} style={{ height: `${(Math.max(0, p.v) / max) * 100}%`, background: p.color }} />
              ))}
            </div>
          </button>
        ))}
      </div>
      <div class="bars-x">
        {bars.map((b, i) => (
          <span key={i}>{showLabels || i % Math.ceil(bars.length / 7) === 0 ? b.label : ''}</span>
        ))}
      </div>
    </div>
  )
}

export function Legend({ items }: { items: { color: string; label: ComponentChildren }[] }) {
  return (
    <div class="legend">
      {items.map((it, i) => (
        <span key={i}>
          <i style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}
