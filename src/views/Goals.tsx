import { useState } from 'preact/hooks'
import { Icon } from '../components/Icon'
import { Card, Field, Num, Page, Seg, Switch } from '../components/ui'
import { today } from '../lib/dates'
import { ACTIVITY, calcGoal, maintenance } from '../lib/goals'
import { LABEL_ORDER, NUTRIENTS, fmtN, type NutrientKey } from '../lib/nutrients'
import { back } from '../lib/router'
import { currentWeight, goals, profile, saveGoals, saveProfile, say } from '../lib/store'
import type { Activity, GoalType, Goals, Profile } from '../lib/types'
import { CONSTANTS, eFrom, eTo, eUnit, fmtW, waterFrom, waterTo, waterUnit, wInFrom, wInTo, wInputUnit } from '../lib/units'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function GoalsView() {
  const [p, setP] = useState<Profile>({ ...profile.value! })
  const [g, setG] = useState<Goals>({ ...goals.value, nutrients: { ...goals.value.nutrients } })
  const kg = currentWeight.value
  const auto = calcGoal(p, kg)
  const kcal = g.kcal ?? auto.kcal
  const pctSum = Math.round((g.carbs + g.protein + g.fat) * 100)
  const metric = wInputUnit() === 'kg'
  const rates = [0.25, 0.5, 0.75, 1]

  const save = async () => {
    if (g.macroMode === 'pct' && pctSum !== 100) return say('Macro percentages must add up to 100%')
    await saveProfile(p)
    await saveGoals(g)
    say('Goals saved')
    back('/more')
  }

  const nutDefault = (k: NutrientKey) => {
    const info = NUTRIENTS[k]
    if (k === 'satFat') return Math.round((kcal * 0.1) / 9)
    if (k === 'sugar') return Math.round((kcal * 0.1) / 4)
    if (k === 'fiber') return Math.round((kcal / 1000) * 14)
    return info.dv
  }

  return (
    <Page
      title="Goals"
      backTo="/more"
      actions={
        <button class="btn primary sm" onClick={save}>
          <Icon name="check" size={1} /> Save
        </button>
      }
    >
      <Card title="Weight goal" icon="scale">
        <Field label="Goal">
          <Seg
            value={p.goalType}
            onChange={(v: GoalType) => setP({ ...p, goalType: v })}
            options={[
              { v: 'lose', label: 'Lose' },
              { v: 'maintain', label: 'Maintain' },
              { v: 'gain', label: 'Gain' },
            ]}
          />
        </Field>
        <div class="grid2">
          <Field label="Starting weight">
            <Num value={wInTo(p.startWeight)} onChange={(v) => v && setP({ ...p, startWeight: wInFrom(v) })} suffix={wInputUnit()} />
          </Field>
          <Field label="Start date">
            <input class="input" type="date" value={p.startDay} max={today()} onChange={(e) => setP({ ...p, startDay: (e.currentTarget as HTMLInputElement).value || p.startDay })} />
          </Field>
          <Field label="Current weight" hint="From your latest weigh-in">
            <div class="input row">{fmtW(kg)}</div>
          </Field>
          {p.goalType !== 'maintain' && (
            <Field label="Goal weight">
              <Num value={wInTo(p.goalWeight)} onChange={(v) => v && setP({ ...p, goalWeight: wInFrom(v) })} suffix={wInputUnit()} />
            </Field>
          )}
        </div>
        {p.goalType !== 'maintain' && (
          <Field label="Weekly goal">
            <select class="input" value={p.rate} onChange={(e) => setP({ ...p, rate: +(e.currentTarget as HTMLSelectElement).value })}>
              {rates.map((r) => (
                <option key={r} value={r}>
                  {p.goalType === 'lose' ? 'Lose' : 'Gain'} {metric ? `${r} kg` : `${Math.round(r * CONSTANTS.LB * 4) / 4} lb`} per week
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Activity level">
          <select class="input" value={p.activity} onChange={(e) => setP({ ...p, activity: (e.currentTarget as HTMLSelectElement).value as Activity })}>
            {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY[a].label}
              </option>
            ))}
          </select>
        </Field>
        <div class="grid2">
          <Field label="Sex">
            <select class="input" value={p.sex} onChange={(e) => setP({ ...p, sex: (e.currentTarget as HTMLSelectElement).value as Profile['sex'] })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <input class="input" type="date" value={p.birth} onChange={(e) => setP({ ...p, birth: (e.currentTarget as HTMLInputElement).value || p.birth })} />
          </Field>
          <Field label="Height">
            <Num value={Math.round(p.height)} onChange={(v) => v && setP({ ...p, height: v })} suffix="cm" />
          </Field>
          <Field label="Name">
            <input class="input" value={p.name ?? ''} onInput={(e) => setP({ ...p, name: (e.currentTarget as HTMLInputElement).value || undefined })} />
          </Field>
        </div>
        <p class="small muted">
          You burn about {Math.round(eTo(maintenance(p, kg))).toLocaleString()} {eUnit()} a day. Suggested goal: {Math.round(eTo(auto.kcal)).toLocaleString()} {eUnit()}.
        </p>
      </Card>

      <Card title="Calories" icon="flame">
        <div class="row between">
          <span class="small">Use the suggested goal</span>
          <Switch label="Use suggested goal" on={g.kcal == null} onChange={(on) => setG({ ...g, kcal: on ? null : auto.kcal })} />
        </div>
        {g.kcal != null && (
          <Field label="Daily calorie goal">
            <Num value={eTo(g.kcal)} onChange={(v) => v && setG({ ...g, kcal: Math.round(eFrom(v)) })} suffix={eUnit()} />
          </Field>
        )}
        <div class="row between mt">
          <span class="small">Different goal on some days</span>
          <Switch label="Calorie goals by day" on={!!g.byDay} onChange={(on) => setG({ ...g, byDay: on ? [null, null, null, null, null, null, null] : null })} />
        </div>
        {g.byDay && (
          <div class="grid2 mt-s">
            {WEEKDAYS.map((w, i) => (
              <Field key={w} label={w}>
                <Num
                  value={g.byDay![i] != null ? eTo(g.byDay![i]!) : undefined}
                  placeholder={String(Math.round(eTo(kcal)))}
                  onChange={(v) => {
                    const next = [...g.byDay!]
                    next[i] = v ? Math.round(eFrom(v)) : null
                    setG({ ...g, byDay: next })
                  }}
                  suffix={eUnit()}
                />
              </Field>
            ))}
          </div>
        )}
      </Card>

      <Card title="Macros" icon="pie">
        <Seg
          value={g.macroMode}
          onChange={(v) => setG({ ...g, macroMode: v, grams: g.grams ?? { carbs: Math.round((kcal * g.carbs) / 4), protein: Math.round((kcal * g.protein) / 4), fat: Math.round((kcal * g.fat) / 9) } })}
          options={[
            { v: 'pct', label: 'Percent' },
            { v: 'grams', label: 'Grams' },
          ]}
        />
        {g.macroMode === 'pct' ? (
          <>
            <div class="grid3 mt">
              {(['carbs', 'protein', 'fat'] as const).map((k) => (
                <Field key={k} label={NUTRIENTS[k].short} hint={`${Math.round((kcal * g[k]) / (k === 'fat' ? 9 : 4))} g`}>
                  <Num value={Math.round(g[k] * 100)} onChange={(v) => setG({ ...g, [k]: (v ?? 0) / 100 })} suffix="%" />
                </Field>
              ))}
            </div>
            <div class={`small ${pctSum === 100 ? 'good' : 'danger'}`}>Total {pctSum}% (must be 100%)</div>
            <div class="chips mt-s">
              {[
                ['Balanced', 0.5, 0.2, 0.3],
                ['High protein', 0.4, 0.3, 0.3],
                ['Low carb', 0.25, 0.3, 0.45],
                ['Keto', 0.05, 0.25, 0.7],
              ].map(([name, c, pr, f]) => (
                <button key={name as string} class="chip" onClick={() => setG({ ...g, carbs: c as number, protein: pr as number, fat: f as number })}>
                  {name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div class="grid3 mt">
            {(['carbs', 'protein', 'fat'] as const).map((k) => (
              <Field key={k} label={NUTRIENTS[k].short}>
                <Num value={g.grams?.[k]} onChange={(v) => setG({ ...g, grams: { ...(g.grams ?? { carbs: 0, protein: 0, fat: 0 }), [k]: v ?? 0 } })} suffix="g" />
              </Field>
            ))}
          </div>
        )}
      </Card>

      <Card title="Other nutrients" icon="leaf">
        <p class="small muted" style={{ marginTop: 0 }}>
          Leave empty to use the standard daily value.
        </p>
        {LABEL_ORDER.filter((k) => !['kcal', 'carbs', 'fat', 'protein', 'monoFat', 'polyFat'].includes(k)).map((k) => (
          <div key={k} class="row gap" style={{ marginBottom: '0.5rem' }}>
            <span class="grow small">{NUTRIENTS[k].label}</span>
            <div style={{ width: '9rem' }}>
              <Num
                value={g.nutrients[k]}
                placeholder={fmtN(nutDefault(k))}
                onChange={(v) => {
                  const next = { ...g.nutrients }
                  if (v == null) delete next[k]
                  else next[k] = v
                  setG({ ...g, nutrients: next })
                }}
                suffix={NUTRIENTS[k].unit}
              />
            </div>
          </div>
        ))}
      </Card>

      <Card title="Water, steps and fitness" icon="target">
        <div class="grid2">
          <Field label="Water per day">
            <Num value={Math.round(waterTo(g.water) * 10) / 10} onChange={(v) => v && setG({ ...g, water: waterFrom(v) })} suffix={waterUnit()} />
          </Field>
          <Field label="Steps per day">
            <Num value={g.steps} onChange={(v) => v && setG({ ...g, steps: Math.round(v) })} />
          </Field>
          <Field label="Workouts per week">
            <Num value={g.workoutsPerWeek} onChange={(v) => setG({ ...g, workoutsPerWeek: Math.round(v ?? 0) })} />
          </Field>
          <Field label="Minutes per workout">
            <Num value={g.minutesPerWorkout} onChange={(v) => setG({ ...g, minutesPerWorkout: Math.round(v ?? 0) })} suffix="min" />
          </Field>
          <Field label="Exercise calories per week">
            <Num value={Math.round(eTo(g.exerciseKcalPerWeek))} onChange={(v) => setG({ ...g, exerciseKcalPerWeek: Math.round(eFrom(v ?? 0)) })} suffix={eUnit()} />
          </Field>
        </div>
      </Card>
    </Page>
  )
}
