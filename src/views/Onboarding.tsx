import { useState } from 'preact/hooks'
import { Icon, Logo } from '../components/Icon'
import { accountSheet, cloudAvailable } from '../lib/account'
import { Field, Num, Seg } from '../components/ui'
import { today } from '../lib/dates'
import { ACTIVITY, calcGoal, maintenance } from '../lib/goals'
import { logWeight, saveProfile, saveSettings, settings } from '../lib/store'
import type { Activity, GoalType, Profile, Sex } from '../lib/types'
import { CONSTANTS, fmtW } from '../lib/units'

const RATES_KG = [0.25, 0.5, 0.75, 1]

export function Onboarding() {
  const [step, setStep] = useState(0)
  const metric = settings.value.weightUnit === 'kg'
  const [goalType, setGoalType] = useState<GoalType>('lose')
  const [activity, setActivity] = useState<Activity>('sedentary')
  const [sex, setSex] = useState<Sex>('male')
  const [birth, setBirth] = useState('1997-01-01')
  const [cm, setCm] = useState<number | undefined>(178)
  const [ft, setFt] = useState<number | undefined>(5)
  const [inch, setInch] = useState<number | undefined>(10)
  const [w, setW] = useState<number | undefined>(metric ? 80 : 176)
  const [gw, setGw] = useState<number | undefined>(metric ? 74 : 163)
  const [rate, setRate] = useState(0.5)
  const [name, setName] = useState('')

  const kg = (v: number | undefined) => (v == null ? 0 : metric ? v : v / CONSTANTS.LB)
  const heightCm = metric ? (cm ?? 0) : ((ft ?? 0) * 12 + (inch ?? 0)) * 2.54
  const profile: Profile = {
    name: name.trim() || undefined,
    sex,
    birth,
    height: heightCm,
    startWeight: kg(w),
    startDay: today(),
    goalWeight: goalType === 'maintain' ? kg(w) : kg(gw),
    rate: goalType === 'maintain' ? 0 : rate,
    goalType,
    activity,
  }
  const valid = [true, true, true, heightCm > 100 && kg(w) > 30 && !!birth, goalType === 'maintain' || (kg(gw) > 30 && (goalType === 'lose' ? kg(gw) < kg(w) : kg(gw) > kg(w))), true]
  const total = 6

  const finish = async () => {
    await saveProfile(profile)
    await logWeight(profile.startWeight, today())
  }

  const setUnits = (m: boolean) =>
    saveSettings(m ? { weightUnit: 'kg', heightUnit: 'cm', waterUnit: 'ml', lengthUnit: 'cm' } : { weightUnit: 'lb', heightUnit: 'ftin', waterUnit: 'floz', lengthUnit: 'in' })

  const res = calcGoal(profile, profile.startWeight || 70)
  const weeks = profile.rate ? Math.abs(profile.startWeight - profile.goalWeight) / profile.rate : 0

  return (
    <div class="onb">
      <div class="row gap">
        {step > 0 && (
          <button class="btn ghost icon" onClick={() => setStep(step - 1)} aria-label="Back">
            <Icon name="left" />
          </button>
        )}
        <div class="steps-dots grow">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} class={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div class="grow">
        {step === 0 && (
          <>
            <div style={{ marginTop: '3rem' }}>
              <Logo size={4} />
            </div>
            <h1>Welcome to Forkful</h1>
            <p class="muted">Track meals, calories, macros, water, exercise and weight. Every feature is free, and a free account keeps your progress backed up.</p>
            {cloudAvailable && (
              <button class="btn outline block" style={{ marginBottom: '1rem' }} onClick={() => (accountSheet.value = 'signin')}>
                <Icon name="user" size={1} /> I already have an account
              </button>
            )}
            <Field label="What should we call you? (optional)">
              <input class="input" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} placeholder="Your name" />
            </Field>
            <Field label="Units">
              <Seg
                value={metric ? 'm' : 'i'}
                options={[
                  { v: 'm', label: 'Metric (kg, cm)' },
                  { v: 'i', label: 'Imperial (lb, ft)' },
                ]}
                onChange={(v) => {
                  setUnits(v === 'm')
                  if ((v === 'm') !== metric) {
                    setW(w ? Math.round(v === 'm' ? w / CONSTANTS.LB : w * CONSTANTS.LB) : w)
                    setGw(gw ? Math.round(v === 'm' ? gw / CONSTANTS.LB : gw * CONSTANTS.LB) : gw)
                  }
                }}
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <h1>What is your goal?</h1>
            <p class="muted">This sets your daily calorie budget. You can change it any time.</p>
            {(
              [
                ['lose', 'Lose weight', 'flame'],
                ['maintain', 'Maintain weight', 'target'],
                ['gain', 'Gain weight', 'dumbbell'],
              ] as const
            ).map(([v, label, icon]) => (
              <button key={v} class={`choice ${goalType === v ? 'on' : ''}`} onClick={() => setGoalType(v)}>
                <span class="row-i">
                  <Icon name={icon} />
                </span>
                <b>{label}</b>
              </button>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <h1>How active are you?</h1>
            <p class="muted">Not counting workouts. You log those separately and earn extra calories for them.</p>
            {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
              <button key={a} class={`choice ${activity === a ? 'on' : ''}`} onClick={() => setActivity(a)}>
                <div>
                  <b>{ACTIVITY[a].label}</b>
                  <div class="small muted">{ACTIVITY[a].desc}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <h1>About you</h1>
            <p class="muted">Used to estimate how many calories you burn.</p>
            <Field label="Sex">
              <Seg
                value={sex}
                options={[
                  { v: 'male', label: 'Male' },
                  { v: 'female', label: 'Female' },
                ]}
                onChange={setSex}
              />
            </Field>
            <Field label="Date of birth">
              <input class="input" type="date" value={birth} max={today()} onChange={(e) => setBirth((e.currentTarget as HTMLInputElement).value)} />
            </Field>
            {metric ? (
              <Field label="Height">
                <Num value={cm} onChange={setCm} suffix="cm" />
              </Field>
            ) : (
              <div class="grid2">
                <Field label="Height (feet)">
                  <Num value={ft} onChange={setFt} suffix="ft" />
                </Field>
                <Field label="(inches)">
                  <Num value={inch} onChange={setInch} suffix="in" />
                </Field>
              </div>
            )}
            <Field label="Current weight">
              <Num value={w} onChange={setW} suffix={metric ? 'kg' : 'lb'} />
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            <h1>{goalType === 'maintain' ? 'All set' : 'Goal weight'}</h1>
            {goalType === 'maintain' ? (
              <p class="muted">We will aim to keep you around {fmtW(kg(w))}.</p>
            ) : (
              <>
                <Field label="Goal weight" hint={!valid[4] ? `Should be ${goalType === 'lose' ? 'below' : 'above'} your current weight.` : undefined}>
                  <Num value={gw} onChange={setGw} suffix={metric ? 'kg' : 'lb'} />
                </Field>
                <div class="field-l" style={{ marginBottom: '0.4rem' }}>
                  Weekly goal
                </div>
                {RATES_KG.map((r) => (
                  <button key={r} class={`choice ${rate === r ? 'on' : ''}`} onClick={() => setRate(r)}>
                    <b>
                      {goalType === 'lose' ? 'Lose' : 'Gain'} {metric ? `${r} kg` : `${Math.round(r * CONSTANTS.LB * 4) / 4} lb`} per week
                    </b>
                    <span class="grow" />
                    {r === 0.5 && <span class="tag good">Recommended</span>}
                  </button>
                ))}
              </>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h1>{profile.name ? `${profile.name}, your` : 'Your'} daily goal</h1>
            <div class="card center-t" style={{ padding: '1.5rem 1rem' }}>
              <div class="hero-num">{res.kcal.toLocaleString()}</div>
              <div class="muted">calories per day</div>
              <div class="sep" />
              <div class="small ink2">
                You burn about {Math.round(maintenance(profile, profile.startWeight)).toLocaleString()} calories a day.
                {goalType !== 'maintain' && weeks > 0 && (
                  <>
                    {' '}
                    At this pace you reach {fmtW(profile.goalWeight)} in about {Math.ceil(weeks)} weeks.
                  </>
                )}
              </div>
              {res.floored && <p class="small warn">We kept the goal at a safe minimum. Consider a slower weekly goal.</p>}
            </div>
            <p class="small muted">Macros start at 50% carbs, 20% protein and 30% fat. Change them, or set different calories for each weekday, under More, Goals.</p>
          </>
        )}
      </div>

      <button class="btn primary block" style={{ minHeight: '3.2rem', marginTop: '1.5rem' }} disabled={!valid[step]} onClick={() => (step < total - 1 ? setStep(step + 1) : finish())}>
        {step === 0 ? 'Get started' : step < total - 1 ? 'Continue' : 'Start tracking'}
      </button>
    </div>
  )
}
