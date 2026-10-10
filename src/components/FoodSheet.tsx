import { useState } from 'preact/hooks'
import { atTime, fmtDay, hhmm } from '../lib/dates'
import { fmtServing, itemNutr, unitLabel } from '../lib/foods'
import { colLabel, colValue, nutrientGoal } from '../lib/goals'
import { LABEL_ORDER, NUTRIENTS, fmtN, insights, macroSplit, type Nutr } from '../lib/nutrients'
import { go } from '../lib/router'
import { deleteEntries, logItems, mealName, say, settings, updateEntry } from '../lib/store'
import type { Day, Entry, Item } from '../lib/types'
import { eUnit, fmtE } from '../lib/units'
import { Icon } from './Icon'
import { Bar, Donut, Num, Sheet } from './ui'

export function NutritionLabel({ n, serving }: { n: Nutr; serving?: string }) {
  const pct = (k: keyof typeof NUTRIENTS) => {
    const dv = NUTRIENTS[k].dv
    const v = n[k]
    return dv && v != null && k !== 'kcal' ? `${Math.round((v / dv) * 100)}%` : ''
  }
  return (
    <div class="label">
      <h4>Nutrition Facts</h4>
      {serving && <div class="small">Amount: {serving}</div>}
      <div class="thick" />
      <div class="lrow big-row">
        <span>Calories</span>
        <span>{fmtN(n.kcal, 'kcal')}</span>
      </div>
      <div class="tiny right-t bold">% Daily Value*</div>
      {LABEL_ORDER.filter((k) => k !== 'kcal').map((k) => (
        <div key={k} class={`lrow ${NUTRIENTS[k].indent ? 'ind' : ''}`}>
          <span>
            {NUTRIENTS[k].indent ? NUTRIENTS[k].label : <b>{NUTRIENTS[k].label}</b>} {n[k] != null ? `${fmtN(n[k])} ${NUTRIENTS[k].unit}` : <span class="muted">-</span>}
          </span>
          <b>{pct(k)}</b>
        </div>
      ))}
      <div class="tiny muted mt-s">* Percent daily values are based on a 2,000 calorie diet. A dash means the value is unknown for this food.</div>
    </div>
  )
}

export function MacroStrip({ n }: { n: Nutr }) {
  const s = macroSplit(n)
  return (
    <div class="macro-strip">
      <Donut
        size={5}
        stroke={14}
        parts={[
          { v: s.carbs, color: 'var(--carbs)' },
          { v: s.fat, color: 'var(--fat)' },
          { v: s.protein, color: 'var(--protein)' },
        ]}
      >
        <div>
          <b style={{ fontSize: '1.05rem' }}>{fmtE(n.kcal ?? 0)}</b>
          <div class="tiny muted">{eUnit()}</div>
        </div>
      </Donut>
      {(
        [
          ['carbs', s.carbs, 'var(--carbs)'],
          ['fat', s.fat, 'var(--fat)'],
          ['protein', s.protein, 'var(--protein)'],
        ] as const
      ).map(([k, share, color]) => (
        <div class="m" key={k}>
          <small style={{ color, fontWeight: 700 }}>{Math.round(share * 100)}%</small>
          <b>{fmtN(colValue(n, k))} g</b>
          <small>{colLabel(k)}</small>
        </div>
      ))}
    </div>
  )
}

/** Detail sheet for logging, editing or picking a food. */
export function FoodSheet({ item, day, meal, entry, onClose, onPick, pickLabel = 'Add' }: { item: Item; day: Day; meal: number; entry?: Entry; onClose: () => void; onPick?: (it: Item) => void; pickLabel?: string }) {
  const [qty, setQty] = useState<number | undefined>(item.qty)
  const [unit, setUnit] = useState(item.unit)
  const [m, setMeal] = useState(entry?.meal ?? meal)
  const [d, setDay] = useState(entry?.day ?? day)
  const [time, setTime] = useState(hhmm(entry?.time ?? Date.now()))
  const [full, setFull] = useState(false)
  const food = item.food
  const it: Item = { food, qty: qty ?? 0, unit }
  const n = itemNutr(it)
  const tips = insights(n)
  const goal = nutrientGoal('kcal', d)

  const submit = async () => {
    if (!qty || qty <= 0) return
    if (onPick) {
      onPick(it)
      onClose()
      return
    }
    const t = settings.value.timestamps ? atTime(d, time) : undefined
    if (entry) {
      await updateEntry({ ...entry, qty, unit, meal: m, day: d, time: t ?? entry.time })
      say('Saved')
    } else {
      await logItems(d, m, [it], t)
      say(`Added to ${mealName(m)}`)
    }
    onClose()
  }

  return (
    <Sheet
      title={entry ? 'Edit entry' : onPick ? 'Add ingredient' : 'Add food'}
      onClose={onClose}
      actions={
        <button class="btn primary sm" onClick={submit} disabled={!qty || qty <= 0}>
          <Icon name="check" size={1} /> {entry ? 'Save' : pickLabel}
        </button>
      }
    >
      <div class="row gap" style={{ alignItems: 'flex-start' }}>
        {food.img && <img src={food.img} alt="" style={{ width: '3.5rem', height: '3.5rem', objectFit: 'contain', borderRadius: '0.5rem', background: '#fff' }} />}
        <div class="grow">
          <h2 style={{ fontSize: '1.15rem' }}>{food.name}</h2>
          <div class="small muted">
            {food.brand && <span>{food.brand} · </span>}
            {food.source === 'usda' ? 'USDA database' : food.source === 'off' ? `Open Food Facts${food.barcode ? ` · ${food.barcode}` : ''}` : food.source === 'recipe' ? 'My recipe' : food.source === 'quick' ? 'Quick add' : food.source === 'ai' ? 'AI estimate' : 'My food'}
          </div>
        </div>
      </div>

      <div class="grid2 mt">
        <label class="field">
          <span class="field-l">Number of servings</span>
          <Num value={qty} onChange={setQty} autoFocus={!entry} ariaLabel="Number of servings" />
        </label>
        <label class="field">
          <span class="field-l">Serving size</span>
          <select class="input" value={unit} onChange={(e) => setUnit(+(e.currentTarget as HTMLSelectElement).value)}>
            {food.units.map((u, i) => (
              <option key={i} value={i}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!onPick && (
        <div class="grid2">
          <label class="field">
            <span class="field-l">Meal</span>
            <select class="input" value={m} onChange={(e) => setMeal(+(e.currentTarget as HTMLSelectElement).value)}>
              {settings.value.meals.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="field-l">{settings.value.timestamps ? 'Date and time' : 'Date'}</span>
            <div class="row gap-s">
              <input class="input" type="date" value={d} onChange={(e) => setDay((e.currentTarget as HTMLInputElement).value || d)} aria-label={fmtDay(d)} />
              {settings.value.timestamps && <input class="input" type="time" value={time} onChange={(e) => setTime((e.currentTarget as HTMLInputElement).value)} style={{ width: '7rem' }} />}
            </div>
          </label>
        </div>
      )}

      <div class="card" style={{ marginTop: '0.25rem' }}>
        <MacroStrip n={n} />
        {!onPick && (
          <div class="mt">
            <div class="row between small">
              <span class="muted">Share of daily goal</span>
              <b>{goal ? Math.round(((n.kcal ?? 0) / goal) * 100) : 0}%</b>
            </div>
            <Bar value={goal ? (n.kcal ?? 0) / goal : 0} />
          </div>
        )}
        {tips.length > 0 && (
          <div class="row wrap gap-xs mt">
            {tips.map((t) => (
              <span key={t.text} class={`tag ${t.tone}`}>
                {t.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <button class="btn outline block" onClick={() => setFull(!full)}>
        <Icon name={full ? 'up' : 'down'} size={1} /> {full ? 'Hide' : 'Show'} nutrition facts
      </button>
      {full && (
        <div class="mt">
          <NutritionLabel n={n} serving={fmtServing(qty ?? 0, food.units[unit])} />
        </div>
      )}

      <div class="col gap-s mt">
        {food.source === 'custom' && !onPick && (
          <button
            class="btn ghost"
            onClick={() => {
              onClose()
              go(`/food/${food.id}`)
            }}
          >
            <Icon name="edit" size={1} /> Edit this food
          </button>
        )}
        {food.source === 'recipe' && !onPick && (
          <button
            class="btn ghost"
            onClick={() => {
              onClose()
              go(`/recipe/${food.id.slice(2)}`)
            }}
          >
            <Icon name="recipe" size={1} /> Open recipe
          </button>
        )}
        {entry && (
          <button
            class="btn ghost danger"
            onClick={async () => {
              await deleteEntries([entry.id])
              onClose()
            }}
          >
            <Icon name="trash" size={1} /> Remove from diary
          </button>
        )}
      </div>
    </Sheet>
  )
}
