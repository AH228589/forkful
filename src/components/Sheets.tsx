import { useState } from 'preact/hooks'
import { fmtDay, today } from '../lib/dates'
import type { Nutr } from '../lib/nutrients'
import { go } from '../lib/router'
import { currentWeight, dayLog, goals, logItems, logWeight, mealName, patchDay, say, settings, uid } from '../lib/store'
import type { Day, Food } from '../lib/types'
import { eFrom, eUnit, fmtW, fmtWater, waterFrom, waterSteps, waterTo, waterUnit, wInFrom, wInTo, wInputUnit } from '../lib/units'
import { Icon } from './Icon'
import { Bar, Field, Num, Sheet } from './ui'

export function QuickAddSheet({ day, meal, onClose }: { day: Day; meal: number; onClose: () => void }) {
  const [m, setM] = useState(meal)
  const [kcal, setKcal] = useState<number | undefined>()
  const [carbs, setCarbs] = useState<number | undefined>()
  const [fat, setFat] = useState<number | undefined>()
  const [protein, setProtein] = useState<number | undefined>()
  const [name, setName] = useState('')
  const fromMacros = (carbs ?? 0) * 4 + (protein ?? 0) * 4 + (fat ?? 0) * 9
  const total = kcal != null ? eFrom(kcal) : fromMacros
  const save = async () => {
    if (!total && !carbs && !fat && !protein) return
    const n: Nutr = { kcal: total }
    if (carbs != null) n.carbs = carbs
    if (fat != null) n.fat = fat
    if (protein != null) n.protein = protein
    const food: Food = { id: `q:${uid()}`, name: name.trim() || 'Quick add', source: 'quick', n, units: [{ label: '1 serving', f: 1 }] }
    await logItems(day, m, [{ food, qty: 1, unit: 0 }])
    say(`Quick added to ${mealName(m)}`)
    onClose()
  }
  return (
    <Sheet
      title="Quick add"
      onClose={onClose}
      actions={
        <button class="btn primary sm" onClick={save}>
          <Icon name="check" size={1} /> Add
        </button>
      }
    >
      <p class="small muted" style={{ marginTop: 0 }}>
        Log calories and macros without picking a food. Leave calories empty to work them out from the macros.
      </p>
      <div class="grid2">
        <Field label="Meal">
          <select class="input" value={m} onChange={(e) => setM(+(e.currentTarget as HTMLSelectElement).value)}>
            {settings.value.meals.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description (optional)">
          <input class="input" value={name} placeholder="Quick add" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </Field>
      </div>
      <Field label={`Calories (${eUnit()})`} hint={kcal == null && fromMacros ? `${Math.round(fromMacros)} from macros` : undefined}>
        <Num value={kcal} onChange={setKcal} autoFocus placeholder={fromMacros ? String(Math.round(fromMacros)) : '0'} />
      </Field>
      <div class="grid3">
        <Field label="Carbs">
          <Num value={carbs} onChange={setCarbs} suffix="g" />
        </Field>
        <Field label="Fat">
          <Num value={fat} onChange={setFat} suffix="g" />
        </Field>
        <Field label="Protein">
          <Num value={protein} onChange={setProtein} suffix="g" />
        </Field>
      </div>
    </Sheet>
  )
}

export function WaterSheet({ day, onClose }: { day: Day; onClose: () => void }) {
  const ml = dayLog(day).water ?? 0
  const [custom, setCustom] = useState<number | undefined>()
  const goal = goals.value.water
  const set = (v: number) => patchDay(day, { water: Math.max(0, Math.round(v)) })
  return (
    <Sheet title={`Water · ${fmtDay(day)}`} onClose={onClose}>
      <div class="center-t">
        <div class="big" style={{ color: 'var(--water)' }}>
          {fmtWater(ml)}
        </div>
        <div class="small muted">of {fmtWater(goal)} goal</div>
      </div>
      <div class="mt">
        <Bar value={goal ? ml / goal : 0} color="var(--water)" over="var(--water)" />
      </div>
      <div class="grid3 mt">
        {waterSteps().map((s) => (
          <button key={s} class="btn soft" style={{ color: 'var(--water)', background: 'color-mix(in srgb, var(--water) 12%, transparent)' }} onClick={() => set(ml + s)}>
            + {fmtWater(s)}
          </button>
        ))}
      </div>
      <div class="row gap-s mt">
        <Num value={custom} onChange={setCustom} suffix={waterUnit()} placeholder="Custom amount" />
        <button class="btn" onClick={() => custom && set(ml + waterFrom(custom))}>
          Add
        </button>
        <button class="btn ghost" onClick={() => custom && set(ml - waterFrom(custom))}>
          Remove
        </button>
      </div>
      <div class="row between mt">
        <button class="btn ghost sm danger" onClick={() => set(0)}>
          Reset day
        </button>
        <span class="tiny muted">Goal is {Math.round(waterTo(goal))} {waterUnit()}, change it in Goals.</span>
      </div>
    </Sheet>
  )
}

export function WeightSheet({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState<number | undefined>(Math.round(wInTo(currentWeight.value) * 10) / 10)
  const [d, setD] = useState(today())
  const save = async () => {
    if (!v || v <= 0) return
    await logWeight(wInFrom(v), d)
    say(`Weight logged: ${fmtW(wInFrom(v))}`)
    onClose()
  }
  return (
    <Sheet
      title="Log weight"
      onClose={onClose}
      actions={
        <button class="btn primary sm" onClick={save}>
          <Icon name="check" size={1} /> Save
        </button>
      }
    >
      <Field label="Weight">
        <Num value={v} onChange={setV} suffix={wInputUnit()} autoFocus />
      </Field>
      <Field label="Date">
        <input class="input" type="date" value={d} max={today()} onChange={(e) => setD((e.currentTarget as HTMLInputElement).value || today())} />
      </Field>
      <button
        class="btn ghost block"
        onClick={() => {
          onClose()
          go('/progress')
        }}
      >
        <Icon name="chart" size={1} /> See progress and measurements
      </button>
    </Sheet>
  )
}

export function StepsSheet({ day, onClose }: { day: Day; onClose: () => void }) {
  const [v, setV] = useState<number | undefined>(dayLog(day).steps)
  return (
    <Sheet
      title={`Steps · ${fmtDay(day)}`}
      onClose={onClose}
      actions={
        <button
          class="btn primary sm"
          onClick={async () => {
            await patchDay(day, { steps: v ? Math.round(v) : 0 })
            say('Steps saved')
            onClose()
          }}
        >
          <Icon name="check" size={1} /> Save
        </button>
      }
    >
      <Field label="Steps today" hint={settings.value.stepCalories ? 'Steps count toward your exercise calories (change this in Settings).' : 'Steps are tracked but do not add calories. Turn that on in Settings.'}>
        <Num value={v} onChange={setV} autoFocus />
      </Field>
    </Sheet>
  )
}
