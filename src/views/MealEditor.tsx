import { useState } from 'preact/hooks'
import { FoodPicker } from '../components/FoodSearch'
import { FoodSheet, MacroStrip } from '../components/FoodSheet'
import { Icon } from '../components/Icon'
import { Card, Field, Page, confirmBox } from '../components/ui'
import { fmtDay, today } from '../lib/dates'
import { fmtServing, itemNutr, recipeTotals } from '../lib/foods'
import { back, go, route } from '../lib/router'
import { deleteMeal, logItems, mealName, meals, saveMeal, say, settings, uid } from '../lib/store'
import type { Item } from '../lib/types'
import { fmtE } from '../lib/units'

export function MealEditor({ id }: { id: string | null }) {
  const existing = id ? meals.value.find((m) => m.id === id) : undefined
  const q = route.value.query
  const day = q.get('day') || today()
  const [meal, setMeal] = useState(Number(q.get('meal') ?? 0))
  const [name, setName] = useState(existing?.name ?? '')
  const [items, setItems] = useState<Item[]>(existing?.items ?? [])
  const [picking, setPicking] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)

  const persist = async () => {
    const m = { id: existing?.id ?? uid(), name: name.trim() || 'My meal', items, created: existing?.created ?? Date.now() }
    await saveMeal(m)
    return m
  }

  return (
    <Page
      title={existing ? name || 'Meal' : 'New meal'}
      backTo="/add?tab=meals"
      actions={
        <button
          class="btn primary sm"
          disabled={!items.length}
          onClick={async () => {
            await persist()
            say('Meal saved')
            back('/add?tab=meals')
          }}
        >
          <Icon name="check" size={1} /> Save
        </button>
      }
    >
      <Card>
        <Field label="Meal name">
          <input class="input" value={name} placeholder="e.g. My usual breakfast" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </Field>
      </Card>
      <Card title="Foods" class="flush">
        {items.map((it, i) => (
          <div key={i} class="entry">
            <button class="grow" style={{ minWidth: 0, textAlign: 'left' }} onClick={() => setEditIdx(i)}>
              <div class="name">{it.food.name}</div>
              <div class="meta">{fmtServing(it.qty, it.food.units[it.unit])}</div>
            </button>
            <span class="kcal">{fmtE(itemNutr(it).kcal ?? 0)}</span>
            <button class="btn ghost icon sm" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              <Icon name="x" size={1} />
            </button>
          </div>
        ))}
        <button class="meal-add" onClick={() => setPicking(true)}>
          <Icon name="plus" size={1} stroke={2.6} /> ADD FOOD
        </button>
      </Card>
      {items.length > 0 && (
        <Card title="Totals">
          <MacroStrip n={recipeTotals({ items })} />
        </Card>
      )}
      {existing && items.length > 0 && (
        <Card title="Log this meal">
          <div class="row gap-s">
            <select class="input" value={meal} onChange={(e) => setMeal(+(e.currentTarget as HTMLSelectElement).value)}>
              {settings.value.meals.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
            <button
              class="btn primary"
              onClick={async () => {
                await persist()
                await logItems(day, meal, items)
                say(`Added to ${mealName(meal)}, ${fmtDay(day)}`)
                go('/diary')
              }}
            >
              Add to {fmtDay(day)}
            </button>
          </div>
        </Card>
      )}
      {existing && (
        <button
          class="btn ghost danger block"
          onClick={async () => {
            if (await confirmBox('Delete this saved meal?', undefined, 'Delete', true)) {
              await deleteMeal(existing.id)
              back('/add?tab=meals')
            }
          }}
        >
          <Icon name="trash" size={1} /> Delete meal
        </button>
      )}
      {picking && <FoodPicker title="Add food" onClose={() => setPicking(false)} onPick={(it) => setItems([...items, it])} />}
      {editIdx != null && <FoodSheet item={items[editIdx]} day="" meal={0} pickLabel="Update" onClose={() => setEditIdx(null)} onPick={(it) => setItems(items.map((x, j) => (j === editIdx ? it : x)))} />}
    </Page>
  )
}
