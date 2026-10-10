import { useState } from 'preact/hooks'
import { BarChart, Legend, LineChart } from '../components/charts'
import { Card, Chip, Page } from '../components/ui'
import { addDays, dayKey, fmtShort, parseDay, range, today, weekStartOf, weekdayShort } from '../lib/dates'
import { colValue, daySummary, exerciseMinutes, nutrientGoal } from '../lib/goals'
import { LABEL_ORDER, NUTRIENTS, fmtN, type NutrientKey } from '../lib/nutrients'
import { dayLog, entriesByDay, exercisesByDay, goals, settings, weights } from '../lib/store'
import { eUnit, fmtE, eTo, fmtWater, waterTo, waterUnit, wTo, wUnit } from '../lib/units'

type Metric = 'net' | 'kcal' | 'macros' | 'exercise' | 'water' | 'steps' | 'weight' | NutrientKey

const METRICS: { v: Metric; label: string }[] = [
  { v: 'kcal', label: 'Calories' },
  { v: 'net', label: 'Net calories' },
  { v: 'macros', label: 'Macros' },
  { v: 'exercise', label: 'Exercise' },
  { v: 'weight', label: 'Weight' },
  { v: 'water', label: 'Water' },
  { v: 'steps', label: 'Steps' },
  ...LABEL_ORDER.filter((k) => k !== 'kcal').map((k) => ({ v: k as Metric, label: NUTRIENTS[k].label })),
]

export function Reports() {
  const [metric, setMetric] = useState<Metric>('kcal')
  const [n, setN] = useState(7)
  const to = today()
  const days = range(addDays(to, -(n - 1)), to)
  const label = (d: string) => (n <= 7 ? weekdayShort(d) : fmtShort(d).split(' ')[0])

  let chart
  let avgText = ''
  if (metric === 'weight') {
    const pts = weights.value.filter((w) => w.day >= days[0]).map((w) => ({ x: parseDay(w.day).getTime(), y: wTo(w.value) }))
    chart = <LineChart points={pts} fmtY={(v) => `${Math.round(v * 10) / 10}`} fmtX={(x) => fmtShort(dayKey(new Date(x)))} />
    if (pts.length > 1) avgText = `Change: ${(pts[pts.length - 1].y - pts[0].y > 0 ? '+' : '') + (Math.round((pts[pts.length - 1].y - pts[0].y) * 10) / 10)} ${wUnit()}`
  } else {
    const vals = days.map((d) => {
      const s = daySummary(d)
      switch (metric) {
        case 'kcal':
          return [{ v: eTo(s.eaten), color: 'var(--accent)' }]
        case 'net':
          return [{ v: eTo(s.net), color: 'var(--accent)' }]
        case 'exercise':
          return [{ v: eTo(s.exercise), color: 'var(--exercise)' }]
        case 'water':
          return [{ v: waterTo(dayLog(d).water ?? 0), color: 'var(--water)' }]
        case 'steps':
          return [{ v: dayLog(d).steps ?? 0, color: 'var(--accent)' }]
        case 'macros':
          return [
            { v: colValue(s.food, 'carbs'), color: 'var(--carbs)' },
            { v: s.food.fat ?? 0, color: 'var(--fat)' },
            { v: s.food.protein ?? 0, color: 'var(--protein)' },
          ]
        default:
          return [{ v: colValue(s.food, metric), color: 'var(--accent)' }]
      }
    })
    const goal =
      metric === 'kcal' || metric === 'net'
        ? eTo(nutrientGoal('kcal', to))
        : metric === 'water'
          ? waterTo(goals.value.water)
          : metric === 'steps'
            ? goals.value.steps
            : metric === 'exercise' || metric === 'macros'
              ? undefined
              : nutrientGoal(metric as NutrientKey, to) || undefined
    const sums = vals.map((p) => p.reduce((s, x) => s + x.v, 0))
    const loggedIdx = days.map((d, i) => ((entriesByDay.value.get(d) ?? []).length || metric === 'water' || metric === 'steps' || metric === 'exercise' ? i : -1)).filter((i) => i >= 0)
    const avg = loggedIdx.length ? loggedIdx.reduce((s, i) => s + sums[i], 0) / loggedIdx.length : 0
    const unit = metric === 'kcal' || metric === 'net' || metric === 'exercise' ? eUnit() : metric === 'water' ? waterUnit() : metric === 'steps' ? 'steps' : metric === 'macros' ? 'g' : NUTRIENTS[metric as NutrientKey].unit
    avgText = `Daily average: ${metric === 'water' ? fmtWater(avg / waterTo(1)) : `${fmtN(avg)} ${unit}`}`
    chart = (
      <>
        <BarChart bars={days.map((d, i) => ({ label: label(d), parts: vals[i], title: `${fmtShort(d)}: ${fmtN(sums[i])} ${unit}` }))} goal={goal} fmtY={(v) => fmtN(v)} height={12} />
        {metric === 'macros' && (
          <Legend
            items={[
              { color: 'var(--carbs)', label: 'Carbs' },
              { color: 'var(--fat)', label: 'Fat' },
              { color: 'var(--protein)', label: 'Protein' },
            ]}
          />
        )}
      </>
    )
  }

  // weekly digest
  const ws = weekStartOf(to, settings.value.weekStart)
  const week = range(ws, addDays(ws, 6)).filter((d) => d <= to)
  const loggedDays = week.filter((d) => (entriesByDay.value.get(d) ?? []).length)
  const under = loggedDays.filter((d) => daySummary(d).remaining >= 0).length
  const avgKcal = loggedDays.length ? loggedDays.reduce((s, d) => s + daySummary(d).eaten, 0) / loggedDays.length : 0
  const workouts = week.reduce((s, d) => s + (exercisesByDay.value.get(d) ?? []).length, 0)
  const minutes = week.reduce((s, d) => s + exerciseMinutes(d), 0)
  const exKcal = week.reduce((s, d) => s + daySummary(d).exercise, 0)

  return (
    <Page title="Reports" backTo="/progress">
      <Card title="This week">
        <div class="grid2" style={{ gap: '0.75rem' }}>
          <div>
            <div class="tiny muted">Days logged</div>
            <div class="tile-v">
              {loggedDays.length}/{week.length}
            </div>
          </div>
          <div>
            <div class="tiny muted">Average calories</div>
            <div class="tile-v">{fmtE(avgKcal)}</div>
          </div>
          <div>
            <div class="tiny muted">Days on target</div>
            <div class="tile-v">{under}</div>
          </div>
          <div>
            <div class="tiny muted">Workouts</div>
            <div class="tile-v">
              {workouts}/{goals.value.workoutsPerWeek}
            </div>
          </div>
        </div>
        <div class="small muted mt-s">
          {minutes} exercise minutes and {fmtE(exKcal)} {eUnit()} burned so far (weekly goal {fmtE(goals.value.exerciseKcalPerWeek)}).
        </div>
      </Card>

      <div class="chips">
        {METRICS.map((m) => (
          <Chip key={m.v} on={metric === m.v} onClick={() => setMetric(m.v)}>
            {m.label}
          </Chip>
        ))}
      </div>
      <Card style={{ marginTop: '0.85rem' }}>
        <div class="row between mb" style={{ marginBottom: '0.85rem' }}>
          <b>{METRICS.find((m) => m.v === metric)!.label}</b>
          <div class="row gap-xs">
            {[7, 30, 90].map((x) => (
              <Chip key={x} on={n === x} onClick={() => setN(x)}>
                {x}d
              </Chip>
            ))}
          </div>
        </div>
        {chart}
        <div class="small muted mt">{avgText}</div>
      </Card>
    </Page>
  )
}
