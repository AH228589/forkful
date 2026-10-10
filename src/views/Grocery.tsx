import { useState } from 'preact/hooks'
import { Icon } from '../components/Icon'
import { Card, Chip, Empty, Page } from '../components/ui'
import { addDays, fmtDay, range, today } from '../lib/dates'
import { fmtServing, itemGrams, itemNutr } from '../lib/foods'
import { go } from '../lib/router'
import { diaryDay, entriesByDay, recipes, say } from '../lib/store'
import type { Item } from '../lib/types'
import { eUnit, fmtE } from '../lib/units'

const KEY = 'forkful-grocery-checked'
const load = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

/** Expand recipes into their ingredients, scaled to the servings eaten. */
function expand(it: Item): Item[] {
  if (it.food.source !== 'recipe') return [it]
  const r = recipes.value.find((x) => `r:${x.id}` === it.food.id)
  if (!r) return [it]
  const servings = it.qty * (it.food.units[it.unit]?.f ?? 1)
  return r.items.map((x) => ({ ...x, qty: (x.qty * servings) / Math.max(1, r.servings) }))
}

export function Grocery() {
  const [n, setN] = useState(7)
  const [checked, setChecked] = useState<string[]>(load())
  const from = addDays(today(), 1)
  const days = range(from, addDays(from, n - 1))
  const planned = days.map((d) => ({ d, list: entriesByDay.value.get(d) ?? [] }))
  const count = planned.reduce((s, x) => s + x.list.length, 0)

  const agg = new Map<string, { name: string; grams: number; parts: Item[] }>()
  for (const { list } of planned)
    for (const e of list)
      for (const it of expand(e)) {
        if (it.food.source === 'quick') continue
        const cur = agg.get(it.food.id) ?? { name: it.food.name, grams: 0, parts: [] }
        cur.grams += itemGrams(it) ?? 0
        cur.parts.push(it)
        agg.set(it.food.id, cur)
      }
  const items = [...agg.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]
    setChecked(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage blocked */
    }
  }

  return (
    <Page title="Meal plan and groceries" backTo="/more">
      <p class="small muted" style={{ marginTop: 0 }}>
        Plan by logging meals on upcoming days in your diary (or copy a day forward). This list adds up everything planned and splits recipes into ingredients.
      </p>
      <div class="chips">
        {[3, 7, 14].map((x) => (
          <Chip key={x} on={n === x} onClick={() => setN(x)}>
            Next {x} days
          </Chip>
        ))}
      </div>

      <div class="section-t">Plan</div>
      <div class="card flush">
        {planned.map(({ d, list }) => (
          <button
            key={d}
            class="listrow"
            onClick={() => {
              diaryDay.value = d
              go('/diary')
            }}
          >
            <span class="grow">
              <span class="row-t">{fmtDay(d, 'short')}</span>
              <span class="row-s">{list.length ? `${list.length} item${list.length === 1 ? '' : 's'} · ${fmtE(list.reduce((s, e) => s + (itemNutr(e).kcal ?? 0), 0))} ${eUnit()}` : 'Nothing planned'}</span>
            </span>
            <Icon name={list.length ? 'right' : 'plus'} class="muted" />
          </button>
        ))}
      </div>

      <div class="section-t row between">
        <span>Shopping list</span>
        {checked.length > 0 && (
          <button
            class="tiny link"
            style={{ textTransform: 'none', letterSpacing: 0 }}
            onClick={() => {
              setChecked([])
              try {
                localStorage.removeItem(KEY)
              } catch {
                /* ignore */
              }
            }}
          >
            Uncheck all
          </button>
        )}
      </div>
      {count === 0 ? (
        <Empty icon="cart" title="Nothing planned yet">
          Open the diary, move to a future day and add meals. They show up here.
        </Empty>
      ) : (
        <Card class="flush">
          {items.map(([id, v]) => (
            <button key={id} class={`entry ${checked.includes(id) ? 'sel' : ''}`} onClick={() => toggle(id)}>
              <span class={`check ${checked.includes(id) ? 'on' : ''}`}>{checked.includes(id) && <Icon name="check" size={0.85} stroke={3} />}</span>
              <div class="grow" style={{ minWidth: 0 }}>
                <div class="name" style={{ textDecoration: checked.includes(id) ? 'line-through' : undefined }}>
                  {v.name}
                </div>
                <div class="meta">{v.grams ? `about ${v.grams >= 1000 ? `${Math.round(v.grams / 100) / 10} kg` : `${Math.round(v.grams)} g`}` : v.parts.map((p) => fmtServing(p.qty, p.food.units[p.unit])).join(' + ')}</div>
              </div>
            </button>
          ))}
          <div style={{ padding: '0.75rem 1rem' }}>
            <button
              class="btn sm soft"
              onClick={async () => {
                const text = items
                  .filter(([id]) => !checked.includes(id))
                  .map(([, v]) => `- ${v.name}${v.grams ? ` (${Math.round(v.grams)} g)` : ''}`)
                  .join('\n')
                try {
                  if (navigator.share) await navigator.share({ title: 'Grocery list', text })
                  else {
                    await navigator.clipboard.writeText(text)
                    say('Copied to clipboard')
                  }
                } catch {
                  /* cancelled */
                }
              }}
            >
              <Icon name="share" size={0.9} /> Share list
            </button>
          </div>
        </Card>
      )}
    </Page>
  )
}
