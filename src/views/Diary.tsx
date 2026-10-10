import { useEffect, useState } from 'preact/hooks'
import { FoodSheet } from '../components/FoodSheet'
import { Icon } from '../components/Icon'
import { Card, Field, Menu, Seg, Sheet, confirmBox, promptBox } from '../components/ui'
import { addDays, fmtDay, fmtTime, today } from '../lib/dates'
import { fmtServing, itemNutr } from '../lib/foods'
import { colLabel, colUnit, colValue, daySummary, foodTotals, nutrientGoal, projection } from '../lib/goals'
import { fmtN, type NutrientKey } from '../lib/nutrients'
import { go } from '../lib/router'
import { copyEntries, dayLog, deleteEntries, deleteExercise, diaryDay, entriesByDay, exercisesByDay, goals, moveEntries, patchDay, saveMeal, say, settings, uid } from '../lib/store'
import type { Day, Entry } from '../lib/types'
import { openSheet } from '../lib/uiState'
import { eUnit, fmtE, fmtW, waterSteps, waterTo, waterUnit, fmtWater } from '../lib/units'

type DateAsk = { title: string; ok: string; meal?: number; run: (day: Day, meal: number) => void; pickMeal?: boolean }

export function Diary() {
  const day = diaryDay.value
  const [mode, setMode] = useState<'cal' | 'macro'>('cal')
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [editing, setEditing] = useState<Entry | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [ask, setAsk] = useState<DateAsk | null>(null)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    setSel([])
    setSelecting(false)
  }, [day])

  const list = entriesByDay.value.get(day) ?? []
  const ex = exercisesByDay.value.get(day) ?? []
  const s = daySummary(day)
  const log = dayLog(day)
  const cols = settings.value.diaryCols
  const setDay = (d: Day) => (diaryDay.value = d)
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const selected = list.filter((e) => sel.includes(e.id))

  const mealMenu = (m: number) => {
    const items = list.filter((e) => e.meal === m)
    return [
      { icon: 'zap', label: 'Quick add calories', fn: () => openSheet('quick', day, m) },
      { icon: 'copy', label: 'Copy from yesterday', fn: () => copyMeal(addDays(day, -1), m, m) },
      { icon: 'calendar', label: 'Copy from another day', fn: () => setAsk({ title: `Copy ${settings.value.meals[m]} from`, ok: 'Copy here', meal: m, pickMeal: true, run: (d, from) => copyMeal(d, from, m) }) },
      items.length > 0 && { icon: 'share', label: 'Copy to another day', fn: () => setAsk({ title: `Copy ${settings.value.meals[m]} to`, ok: 'Copy', meal: m, pickMeal: true, run: (d, to) => copyEntries(items, d, to).then(() => say(`Copied to ${fmtDay(d)}`)) }) },
      items.length > 0 && {
        icon: 'star',
        label: 'Save as a meal',
        fn: async () => {
          const name = await promptBox('Name this meal', `${settings.value.meals[m]} ${fmtDay(day, 'tiny')}`)
          if (!name) return
          await saveMeal({ id: uid(), name, items: items.map((e) => ({ food: e.food, qty: e.qty, unit: e.unit })), created: Date.now() })
          say('Saved to My meals')
        },
      },
      items.length > 0 && {
        icon: 'trash',
        label: 'Remove all',
        danger: true,
        fn: () => deleteEntries(items.map((e) => e.id)),
      },
    ]
  }

  const copyMeal = async (from: Day, fromMeal: number, toMeal: number) => {
    const src = (entriesByDay.value.get(from) ?? []).filter((e) => e.meal === fromMeal)
    if (!src.length) return say(`Nothing logged for ${settings.value.meals[fromMeal]} on ${fmtDay(from)}`)
    await copyEntries(src, day, toMeal)
    say(`Copied ${src.length} food${src.length === 1 ? '' : 's'}`)
  }

  const cups = Math.round(waterTo(log.water ?? 0) / (settings.value.waterUnit === 'ml' ? 250 : settings.value.waterUnit === 'floz' ? 8 : 1))
  const cupGoal = Math.max(1, Math.round(waterTo(goals.value.water) / (settings.value.waterUnit === 'ml' ? 250 : settings.value.waterUnit === 'floz' ? 8 : 1)))

  return (
    <div class="page">
      <header class="pagebar">
        <div class="daybar grow" style={{ margin: 0 }}>
          <button class="btn ghost icon" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
            <Icon name="left" />
          </button>
          <label class="day-btn" style={{ position: 'relative' }}>
            <span>{fmtDay(day)}</span>
            {day !== today() && <span class="tiny muted">{fmtDay(day, 'short')}</span>}
            <input type="date" value={day} onChange={(e) => (e.currentTarget as HTMLInputElement).value && setDay((e.currentTarget as HTMLInputElement).value)} style={{ position: 'absolute', inset: 0, opacity: 0 }} aria-label="Pick a date" />
          </label>
          <button class="btn ghost icon" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
            <Icon name="right" />
          </button>
        </div>
        {day !== today() && (
          <button class="btn sm soft" onClick={() => setDay(today())}>
            Today
          </button>
        )}
        <button class={`btn sm ${selecting ? 'primary' : 'ghost'}`} onClick={() => (setSelecting(!selecting), setSel([]))}>
          {selecting ? 'Done' : 'Select'}
        </button>
      </header>

      <Card>
        <div class="row between" style={{ marginBottom: '0.6rem' }}>
          <span class="small bold">{mode === 'cal' ? 'Calories remaining' : 'Macros remaining'}</span>
          <Seg
            value={mode}
            options={[
              { v: 'cal', label: eUnit() },
              { v: 'macro', label: 'Macros' },
            ]}
            onChange={setMode}
          />
        </div>
        {mode === 'cal' ? (
          <div class="equation">
            <div>
              <b>{fmtE(s.goal)}</b>
              <small>Goal</small>
            </div>
            <span class="op">-</span>
            <div>
              <b>{fmtE(s.eaten)}</b>
              <small>Food</small>
            </div>
            <span class="op">+</span>
            <div>
              <b>{fmtE(s.counted)}</b>
              <small>Exercise</small>
            </div>
            <span class="op">=</span>
            <div>
              <b class={s.remaining < 0 ? 'danger' : 'accent'}>{fmtE(s.remaining)}</b>
              <small>Remaining</small>
            </div>
          </div>
        ) : (
          <div class="grid3 center-t">
            {(['carbs', 'fat', 'protein'] as const).map((k) => {
              const left = nutrientGoal(k, day) - colValue(s.food, k)
              return (
                <div key={k}>
                  <b class={left < 0 ? 'danger' : ''} style={{ fontSize: '1.1rem' }}>
                    {fmtN(left)} g
                  </b>
                  <div class="tiny muted">{colLabel(k)} left</div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {settings.value.meals.map((name, m) => {
        const items = list.filter((e) => e.meal === m)
        const t = foodTotals(day, m)
        return (
          <section class="meal" key={m}>
            <div class="meal-h">
              <h3>
                {name}
                {settings.value.mealMacros && items.length > 0 && (
                  <div class="meal-sub">
                    C {fmtN(colValue(t, 'carbs'))} · F {fmtN(t.fat)} · P {fmtN(t.protein)} g
                  </div>
                )}
              </h3>
              <b class="num-t">{items.length ? fmtE(t.kcal ?? 0) : ''}</b>
              <button class="btn ghost icon sm" onClick={() => setMenu(m)} aria-label={`${name} options`}>
                <Icon name="dots" />
              </button>
            </div>
            {items.map((e) => (
              <button key={e.id} class={`entry ${sel.includes(e.id) ? 'sel' : ''}`} onClick={() => (selecting ? toggle(e.id) : setEditing(e))}>
                {selecting && <span class={`check ${sel.includes(e.id) ? 'on' : ''}`}>{sel.includes(e.id) && <Icon name="check" size={0.85} stroke={3} />}</span>}
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="name">{e.food.name}</div>
                  <div class="meta">
                    {e.food.brand ? `${e.food.brand}, ` : ''}
                    {fmtServing(e.qty, e.food.units[e.unit])}
                    {settings.value.timestamps && ` · ${fmtTime(e.time)}`}
                  </div>
                </div>
                <span class="kcal">{fmtE(itemNutr(e).kcal ?? 0)}</span>
              </button>
            ))}
            {!selecting && (
              <a class="meal-add" href={`#/add?day=${day}&meal=${m}`}>
                <Icon name="plus" size={1} stroke={2.6} /> ADD FOOD
              </a>
            )}
          </section>
        )
      })}

      <section class="meal">
        <div class="meal-h">
          <h3>Exercise</h3>
          <b class="num-t">{ex.length ? fmtE(ex.reduce((a, x) => a + x.kcal, 0)) : ''}</b>
        </div>
        {ex.map((x) => (
          <div key={x.id} class="entry">
            <div class="grow" style={{ minWidth: 0 }}>
              <div class="name">{x.name}</div>
              <div class="meta">{x.kind === 'strength' ? `${x.sets ?? 0} sets × ${x.reps ?? 0} reps${x.weight ? ` @ ${fmtW(x.weight)}` : ''}` : `${x.minutes ?? 0} min`}</div>
            </div>
            <span class="kcal">{fmtE(x.kcal)}</span>
            <button class="btn ghost icon sm" aria-label={`Remove ${x.name}`} onClick={() => deleteExercise(x.id)}>
              <Icon name="trash" size={1} />
            </button>
          </div>
        ))}
        {(log.steps ?? 0) > 0 && (
          <button class="entry" onClick={() => openSheet('steps', day)}>
            <div class="grow">
              <div class="name">Steps</div>
              <div class="meta">{(log.steps ?? 0).toLocaleString()} steps{settings.value.stepCalories ? '' : ', not counted as calories'}</div>
            </div>
          </button>
        )}
        <a class="meal-add" href={`#/exercise?day=${day}`}>
          <Icon name="plus" size={1} stroke={2.6} /> ADD EXERCISE
        </a>
      </section>

      <section class="meal">
        <div class="meal-h">
          <h3>Water</h3>
          <span class="small muted">
            {fmtWater(log.water ?? 0)} of {fmtWater(goals.value.water)}
          </span>
        </div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <button class="water-cups" style={{ width: '100%' }} onClick={() => openSheet('water', day)} aria-label="Water details">
            {Array.from({ length: Math.max(cupGoal, cups) }, (_, i) => (
              <i key={i} class={i < cups ? 'on' : ''} />
            ))}
          </button>
          <div class="row gap-s mt-s">
            <button class="btn sm soft" onClick={() => patchDay(day, { water: (log.water ?? 0) + waterSteps()[0] })}>
              + {fmtWater(waterSteps()[0])}
            </button>
            <button class="btn sm ghost" onClick={() => patchDay(day, { water: Math.max(0, (log.water ?? 0) - waterSteps()[0]) })}>
              - {fmtWater(waterSteps()[0])}
            </button>
            <span class="grow" />
            <span class="tiny muted">{waterUnit()}</span>
          </div>
        </div>
      </section>

      <section class="meal">
        <div class="meal-h">
          <h3>Notes</h3>
        </div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <textarea class="input" placeholder="How did today go? Cravings, mood, anything." value={log.foodNote ?? ''} onBlur={(e) => patchDay(day, { foodNote: (e.currentTarget as HTMLTextAreaElement).value })} />
        </div>
      </section>

      <Card>
        <table class="foot-table">
          <thead>
            <tr>
              <th />
              <th>{eUnit()}</th>
              {cols.map((k) => (
                <th key={k}>{colLabel(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Totals</td>
              <td>{fmtE(s.eaten)}</td>
              {cols.map((k) => (
                <td key={k}>{fmtN(colValue(s.food, k))}</td>
              ))}
            </tr>
            <tr>
              <td>Daily goal</td>
              <td>{fmtE(s.goal + s.counted)}</td>
              {cols.map((k) => (
                <td key={k}>{fmtN(nutrientGoal(k as NutrientKey, day))}</td>
              ))}
            </tr>
            <tr>
              <td>Remaining</td>
              <td class={s.remaining < 0 ? 'danger' : 'good'}>{fmtE(s.remaining)}</td>
              {cols.map((k) => {
                const left = nutrientGoal(k as NutrientKey, day) - colValue(s.food, k)
                return (
                  <td key={k} class={left < 0 ? 'danger' : 'good'}>
                    {fmtN(left)}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
        <div class="tiny muted mt-s right-t">{cols.map((k) => `${colLabel(k)} ${colUnit(k)}`).join(' · ')}</div>
      </Card>

      <div class="grid2" style={{ gap: '0.6rem' }}>
        <button class="btn outline" onClick={() => go(`/nutrition?day=${day}`)}>
          <Icon name="pie" size={1} /> Nutrition
        </button>
        <button class="btn primary" onClick={() => (patchDay(day, { completed: true }), setComplete(true))}>
          <Icon name="check" size={1} /> {log.completed ? 'Completed' : 'Complete diary'}
        </button>
      </div>

      {selecting && sel.length > 0 && (
        <div class="toast" style={{ padding: '0.4rem 0.5rem 0.4rem 1rem' }}>
          <span>{sel.length} selected</span>
          <button onClick={() => setAsk({ title: 'Move to', ok: 'Move', pickMeal: true, meal: selected[0]?.meal ?? 0, run: (d, m) => moveEntries(sel, d, m).then(() => (setSel([]), say('Moved'))) })}>Move</button>
          <button onClick={() => setAsk({ title: 'Copy to', ok: 'Copy', pickMeal: true, meal: selected[0]?.meal ?? 0, run: (d, m) => copyEntries(selected, d, m).then(() => (setSel([]), say(`Copied to ${fmtDay(d)}`))) })}>Copy</button>
          <button
            onClick={async () => {
              const name = await promptBox('Save selection as a meal', 'My meal')
              if (!name) return
              await saveMeal({ id: uid(), name, items: selected.map((e) => ({ food: e.food, qty: e.qty, unit: e.unit })), created: Date.now() })
              say('Saved to My meals')
            }}
          >
            Save
          </button>
          <button
            style={{ color: 'var(--critical)' }}
            onClick={async () => {
              await deleteEntries(sel)
              setSel([])
            }}
          >
            Delete
          </button>
        </div>
      )}

      {editing && <FoodSheet item={editing} entry={editing} day={day} meal={editing.meal} onClose={() => setEditing(null)} />}
      {menu != null && <Menu title={settings.value.meals[menu]} items={mealMenu(menu)} onClose={() => setMenu(null)} />}
      {ask && <DateAskSheet ask={ask} day={day} onClose={() => setAsk(null)} />}
      {complete && <CompleteSheet day={day} onClose={() => setComplete(false)} />}
    </div>
  )
}

function DateAskSheet({ ask, day, onClose }: { ask: DateAsk; day: Day; onClose: () => void }) {
  const [d, setD] = useState(ask.title.startsWith('Copy') && ask.title.includes('from') ? addDays(day, -1) : addDays(day, 1))
  const [m, setM] = useState(ask.meal ?? 0)
  return (
    <Sheet
      title={ask.title}
      onClose={onClose}
      actions={
        <button
          class="btn primary sm"
          onClick={() => {
            ask.run(d, m)
            onClose()
          }}
        >
          {ask.ok}
        </button>
      }
    >
      <Field label="Day">
        <input class="input" type="date" value={d} onChange={(e) => setD((e.currentTarget as HTMLInputElement).value || d)} />
      </Field>
      {ask.pickMeal && (
        <Field label="Meal">
          <select class="input" value={m} onChange={(e) => setM(+(e.currentTarget as HTMLSelectElement).value)}>
            {settings.value.meals.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Sheet>
  )
}

function CompleteSheet({ day, onClose }: { day: Day; onClose: () => void }) {
  const kg = projection(day)
  const s = daySummary(day)
  return (
    <Sheet title="Diary complete" onClose={onClose}>
      <div class="center-t" style={{ padding: '1rem 0' }}>
        <div class="icon-big" style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', margin: '0 auto 1rem' }}>
          <Icon name="check" size={1.8} stroke={2.6} />
        </div>
        {kg != null ? (
          <>
            <p class="muted">If every day were like {day === today() ? 'today' : 'this day'}, you would weigh</p>
            <div class="hero-num">{fmtW(kg)}</div>
            <p class="muted">in 5 weeks.</p>
          </>
        ) : (
          <p class="muted">Log some food first to see where today would take you.</p>
        )}
        <p class="small ink2">
          {s.remaining >= 0 ? `You stayed ${fmtE(s.remaining)} ${eUnit()} under your goal.` : `You went ${fmtE(-s.remaining)} ${eUnit()} over your goal.`}
        </p>
      </div>
      <button
        class="btn ghost block"
        onClick={async () => {
          if (await confirmBox('Mark this day as not complete?')) {
            await patchDay(day, { completed: false })
            onClose()
          }
        }}
      >
        Undo complete
      </button>
    </Sheet>
  )
}
