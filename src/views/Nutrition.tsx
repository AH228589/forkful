import { useState } from 'preact/hooks'
import { Legend } from '../components/charts'
import { MacroStrip } from '../components/FoodSheet'
import { Icon } from '../components/Icon'
import { Bar, Card, Donut, Page, Seg, Sheet } from '../components/ui'
import { addDays, fmtDay, range, weekStartOf } from '../lib/dates'
import { itemNutr } from '../lib/foods'
import { colLabel, colValue, foodTotals, nutrientGoal } from '../lib/goals'
import { LABEL_ORDER, NUTRIENTS, add, fmtN, macroSplit, scale, type Nutr, type NutrientKey } from '../lib/nutrients'
import { entriesByDay, goals, settings } from '../lib/store'
import type { Day } from '../lib/types'
import { eUnit, fmtE } from '../lib/units'

const MEAL_COLORS = ['var(--carbs)', 'var(--protein)', 'var(--fat)', 'var(--accent)', 'var(--exercise)', 'var(--water)']

export function NutritionView({ day }: { day: Day }) {
  const [tab, setTab] = useState<'cal' | 'nut' | 'mac'>('cal')
  const [span, setSpan] = useState<'day' | 'week'>('day')
  const [d, setD] = useState(day)
  const [top, setTop] = useState<NutrientKey | null>(null)

  const days = span === 'day' ? [d] : range(weekStartOf(d, settings.value.weekStart), addDays(weekStartOf(d, settings.value.weekStart), 6))
  const logged = days.filter((x) => (entriesByDay.value.get(x) ?? []).length)
  const div = span === 'day' ? 1 : Math.max(1, logged.length)
  let total: Nutr = {}
  for (const x of days) total = add(total, foodTotals(x))
  const avg = scale(total, 1 / div)
  const mealTotals = settings.value.meals.map((_, m) => days.reduce((s, x) => s + (foodTotals(x, m).kcal ?? 0), 0) / div)
  const goalK = nutrientGoal('kcal', d)

  return (
    <Page title="Nutrition" backTo="/diary">
      <div class="row gap-s">
        <button class="btn ghost icon" aria-label="Previous" onClick={() => setD(addDays(d, span === 'day' ? -1 : -7))}>
          <Icon name="left" />
        </button>
        <div class="grow center-t bold">{span === 'day' ? fmtDay(d) : `Week of ${fmtDay(days[0], 'tiny')}`}</div>
        <button class="btn ghost icon" aria-label="Next" onClick={() => setD(addDays(d, span === 'day' ? 1 : 7))}>
          <Icon name="right" />
        </button>
      </div>
      <div class="row gap-s mt-s">
        <Seg
          class="grow"
          value={tab}
          onChange={setTab}
          options={[
            { v: 'cal', label: 'Calories' },
            { v: 'nut', label: 'Nutrients' },
            { v: 'mac', label: 'Macros' },
          ]}
        />
        <Seg
          value={span}
          onChange={setSpan}
          options={[
            { v: 'day', label: 'Day' },
            { v: 'week', label: 'Week' },
          ]}
        />
      </div>
      {span === 'week' && <p class="tiny muted center-t">Daily averages over {logged.length} logged day{logged.length === 1 ? '' : 's'}.</p>}

      {tab === 'cal' && (
        <Card style={{ marginTop: '0.85rem' }}>
          <div class="row gap-l">
            <Donut size={9} stroke={18} parts={mealTotals.map((v, i) => ({ v, color: MEAL_COLORS[i % MEAL_COLORS.length] }))}>
              <div>
                <b style={{ fontSize: '1.4rem' }}>{fmtE(avg.kcal ?? 0)}</b>
                <div class="tiny muted">{eUnit()}</div>
              </div>
            </Donut>
            <div class="col gap-s grow">
              {settings.value.meals.map((name, i) => (
                <div key={i} class="row gap-s small">
                  <i class="dot" style={{ background: MEAL_COLORS[i % MEAL_COLORS.length] }} />
                  <span class="grow">{name}</span>
                  <b>{avg.kcal ? Math.round((mealTotals[i] / (avg.kcal || 1)) * 100) : 0}%</b>
                </div>
              ))}
            </div>
          </div>
          <div class="sep" />
          <div class="row between small">
            <span class="muted">Goal</span>
            <b>
              {fmtE(goalK)} {eUnit()}
            </b>
          </div>
          <div class="row between small">
            <span class="muted">{span === 'day' ? 'Eaten' : 'Average eaten'}</span>
            <b>{fmtE(avg.kcal ?? 0)}</b>
          </div>
          <div class="mt-s">
            <Bar value={(avg.kcal ?? 0) / goalK} />
          </div>
          <TopFoods days={days} k="kcal" />
        </Card>
      )}

      {tab === 'nut' && (
        <Card style={{ marginTop: '0.85rem' }}>
          <table class="ntable">
            <thead>
              <tr>
                <th>Nutrient</th>
                <th>Total</th>
                <th>Goal</th>
                <th>Left</th>
              </tr>
            </thead>
            <tbody>
              {LABEL_ORDER.flatMap((k) => {
                const v = k === 'carbs' ? colValue(avg, k) : (avg[k] ?? 0)
                const g = nutrientGoal(k, d)
                const left = g - v
                const info = NUTRIENTS[k]
                const unit = k === 'kcal' ? '' : info.unit
                return [
                  <tr key={k} onClick={() => setTop(k)} style={{ cursor: 'pointer' }}>
                    <td style={{ paddingLeft: info.indent ? '0.9rem' : undefined }}>{k === 'carbs' ? colLabel(k) : info.label}</td>
                    <td>
                      {k === 'kcal' ? fmtE(v) : fmtN(v)}
                      <span class="tiny muted"> {unit}</span>
                    </td>
                    <td>{g ? (k === 'kcal' ? fmtE(g) : fmtN(g)) : '-'}</td>
                    <td class={g ? (info.kind === 'limit' || k === 'kcal' ? (left < 0 ? 'danger' : 'good') : left <= 0 ? 'good' : '') : ''}>{g ? (k === 'kcal' ? fmtE(left) : fmtN(left)) : '-'}</td>
                  </tr>,
                  <tr key={`${k}b`} class="barrow">
                    <td colSpan={4}>{g ? <Bar value={v / g} color={info.kind === 'limit' ? 'var(--warn)' : 'var(--accent)'} over={info.kind === 'limit' || k === 'kcal' ? 'var(--critical)' : 'var(--good)'} /> : null}</td>
                  </tr>,
                ]
              })}
            </tbody>
          </table>
          <p class="tiny muted">Tap a nutrient to see which foods gave you the most. Goals for vitamins and minerals follow the daily values unless you set your own in Goals.</p>
        </Card>
      )}

      {tab === 'mac' && (
        <Card style={{ marginTop: '0.85rem' }}>
          <MacroStrip n={avg} />
          <div class="sep" />
          <table class="ntable">
            <thead>
              <tr>
                <th />
                <th>Total</th>
                <th>Share</th>
                <th>Goal</th>
              </tr>
            </thead>
            <tbody>
              {(['carbs', 'fat', 'protein'] as const).map((k) => {
                const s = macroSplit(avg)[k]
                const g = goals.value.macroMode === 'pct' ? goals.value[k] : (nutrientGoal(k, d) * (k === 'fat' ? 9 : 4)) / nutrientGoal('kcal', d)
                return (
                  <tr key={k} onClick={() => setTop(k)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span class="row gap-s">
                        <i class="dot" style={{ background: `var(--${k})` }} />
                        {colLabel(k)}
                      </span>
                    </td>
                    <td>{fmtN(colValue(avg, k))} g</td>
                    <td>{Math.round(s * 100)}%</td>
                    <td>{Math.round(g * 100)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Legend
            items={[
              { color: 'var(--carbs)', label: '4 cal per g carbs' },
              { color: 'var(--fat)', label: '9 cal per g fat' },
              { color: 'var(--protein)', label: '4 cal per g protein' },
            ]}
          />
        </Card>
      )}
      {top && (
        <Sheet title={`Top foods: ${NUTRIENTS[top].label}`} onClose={() => setTop(null)}>
          <TopFoods days={days} k={top} limit={20} />
        </Sheet>
      )}
    </Page>
  )
}

function TopFoods({ days, k, limit = 5 }: { days: Day[]; k: NutrientKey; limit?: number }) {
  const map = new Map<string, { name: string; v: number }>()
  for (const d of days)
    for (const e of entriesByDay.value.get(d) ?? []) {
      const v = itemNutr(e)[k] ?? 0
      if (!v) continue
      const cur = map.get(e.food.id) ?? { name: e.food.name, v: 0 }
      cur.v += v
      map.set(e.food.id, cur)
    }
  const list = [...map.values()].sort((a, b) => b.v - a.v).slice(0, limit)
  const max = list[0]?.v ?? 1
  if (!list.length) return <p class="small muted">Nothing logged with {NUTRIENTS[k].label.toLowerCase()} yet.</p>
  return (
    <div class="mt">
      <div class="small bold mb" style={{ marginBottom: '0.5rem' }}>
        Highest in {NUTRIENTS[k].label.toLowerCase()}
      </div>
      {list.map((f) => (
        <div key={f.name} style={{ marginBottom: '0.55rem' }}>
          <div class="row between small gap-s">
            <span class="ellipsis">{f.name}</span>
            <b class="num-t">
              {k === 'kcal' ? fmtE(f.v) : fmtN(f.v)} {k === 'kcal' ? eUnit() : NUTRIENTS[k].unit}
            </b>
          </div>
          <Bar value={f.v / max} />
        </div>
      ))}
    </div>
  )
}
