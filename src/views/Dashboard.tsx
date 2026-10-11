import { useEffect, useState } from 'preact/hooks'
import { LineChart } from '../components/charts'
import { Icon, Logo } from '../components/Icon'
import { AccountBanner } from '../components/Account'
import { InstallHint } from '../components/InstallHint'
import { Bar, Card, Ring } from '../components/ui'
import { addDays, dayKey, fmtDuration, fmtShort, parseDay, today } from '../lib/dates'
import { colLabel, colUnit, colValue, daySummary, exerciseMinutes, nutrientGoal } from '../lib/goals'
import { fmtN, type NutrientKey } from '../lib/nutrients'
import { go } from '../lib/router'
import { activeFast, currentWeight, dayLog, diaryDay, goals, profile, settings, streak, weights } from '../lib/store'
import { openSheet } from '../lib/uiState'
import { eUnit, fmtE, fmtW, fmtWater, wTo, wUnit } from '../lib/units'

function NutRing({ k, n, color, day }: { k: string; n: Record<string, number | undefined>; color: string; day: string }) {
  const v = colValue(n, k)
  const goal = nutrientGoal(k as NutrientKey, day)
  const left = goal - v
  return (
    <div>
      <Ring share={goal ? v / goal : 0} size={5.2} stroke={10} color={color} over={left < 0}>
        <div>
          <b style={{ fontSize: '1.05rem' }}>{fmtN(Math.abs(left))}</b>
          <div class="tiny muted">{left < 0 ? 'over' : 'left'}</div>
        </div>
      </Ring>
      <div class="small bold mt-s">{colLabel(k)}</div>
      <div class="tiny muted">
        {fmtN(v)}/{fmtN(goal)} {colUnit(k)}
      </div>
    </div>
  )
}

export function Dashboard() {
  const t = today()
  const s = daySummary(t)
  const [slide, setSlide] = useState(0)
  const [, tick] = useState(0)
  const fast = activeFast.value
  useEffect(() => {
    diaryDay.value = t
    if (!fast) return
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [fast])

  const n = s.food as Record<string, number | undefined>
  const log = dayLog(t)
  const water = log.water ?? 0
  const w = weights.value
  const since = addDays(t, -90)
  const pts = w.filter((x) => x.day >= since).map((x) => ({ x: parseDay(x.day).getTime(), y: wTo(x.value) }))
  const p = profile.value!
  const change = currentWeight.value - p.startWeight
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const cards = 5

  return (
    <div>
      <header class="topbar" style={{ margin: '0 -1rem' }}>
        <div class="brand">
          <Logo /> <span>Forkful</span>
        </div>
        <div class="grow" />
        {streak.value > 0 && (
          <span class="tag good" title="Days logged in a row">
            <Icon name="flame" size={0.9} /> {streak.value} day{streak.value === 1 ? '' : 's'}
          </span>
        )}
        <a class="btn ghost icon" href="#/settings" aria-label="Settings">
          <Icon name="settings" />
        </a>
      </header>

      <h1 style={{ margin: '0.25rem 0 0.9rem' }}>
        {greet}
        {p.name ? `, ${p.name}` : ''}
      </h1>

      <InstallHint />
      <AccountBanner />

      <button class="search" style={{ width: '100%', marginBottom: '0.9rem' }} onClick={() => go(`/add?day=${t}&meal=${defaultMeal()}`)}>
        <Icon name="search" />
        <div class="input row muted" style={{ paddingLeft: '2.6rem', borderRadius: '999rem', minHeight: '3rem' }}>
          Search for a food
        </div>
        <span class="search-btns">
          <span
            class="btn ghost icon"
            role="button"
            aria-label="Scan a barcode"
            onClick={(e) => {
              e.stopPropagation()
              go(`/add?day=${t}&meal=${defaultMeal()}&scan=1`)
            }}
          >
            <Icon name="scan" />
          </span>
        </span>
      </button>

      <div
        class="carousel"
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement
          setSlide(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        <Card title="Calories" action={<span class="tiny muted">Remaining = Goal - Food + Exercise</span>} onClick={() => go('/diary')}>
          <div class="dash-cal">
            <Ring share={s.goal ? s.eaten / (s.goal + s.counted) : 0} size={8.5} stroke={9} over={s.remaining < 0}>
              <div>
                <b>{fmtE(Math.abs(s.remaining))}</b>
                <span class="tiny muted">{s.remaining < 0 ? 'Over' : 'Remaining'}</span>
              </div>
            </Ring>
            <div class="dash-legend">
              <div>
                <Icon name="target" class="muted" />
                <div>
                  <div class="lbl">Base goal</div>
                  <div class="val">{fmtE(s.goal)}</div>
                </div>
              </div>
              <div>
                <Icon name="utensils" style={{ color: 'var(--accent)' }} />
                <div>
                  <div class="lbl">Food</div>
                  <div class="val">{fmtE(s.eaten)}</div>
                </div>
              </div>
              <div>
                <Icon name="flame" style={{ color: 'var(--exercise)' }} />
                <div>
                  <div class="lbl">Exercise{!settings.value.exerciseCalories && ' (not added)'}</div>
                  <div class="val">{fmtE(s.exercise)}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
        <Card title="Macros" onClick={() => go(`/nutrition?day=${t}`)}>
          <div class="macro-rings">
            <NutRing k="carbs" n={n} color="var(--carbs)" day={t} />
            <NutRing k="fat" n={n} color="var(--fat)" day={t} />
            <NutRing k="protein" n={n} color="var(--protein)" day={t} />
          </div>
        </Card>
        <Card title="Heart healthy" onClick={() => go(`/nutrition?day=${t}`)}>
          <div class="macro-rings">
            <NutRing k="fat" n={n} color="var(--fat)" day={t} />
            <NutRing k="sodium" n={n} color="var(--carbs)" day={t} />
            <NutRing k="chol" n={n} color="var(--protein)" day={t} />
          </div>
        </Card>
        <Card title="Low carb" onClick={() => go(`/nutrition?day=${t}`)}>
          <div class="macro-rings">
            <NutRing k="carbs" n={n} color="var(--carbs)" day={t} />
            <NutRing k="sugar" n={n} color="var(--protein)" day={t} />
            <NutRing k="fiber" n={n} color="var(--accent)" day={t} />
          </div>
        </Card>
        <Card title="My nutrients" action={<a class="tiny link" href="#/settings" onClick={(e) => e.stopPropagation()}>Choose</a>}>
          <div class="macro-rings">
            {settings.value.dashCustom.slice(0, 3).map((k, i) => (
              <NutRing key={k} k={k} n={n} color={['var(--accent)', 'var(--carbs)', 'var(--fat)'][i]} day={t} />
            ))}
          </div>
        </Card>
      </div>
      <div class="dots">
        {Array.from({ length: cards }, (_, i) => (
          <i key={i} class={i === slide ? 'on' : ''} />
        ))}
      </div>

      <div class="tiles">
        <Card onClick={() => openSheet('steps', t)}>
          <div class="row gap-s small muted">
            <Icon name="steps" size={1} style={{ color: 'var(--accent)' }} /> Steps
          </div>
          <div class="tile-v">{(log.steps ?? 0).toLocaleString()}</div>
          <Bar value={(log.steps ?? 0) / (goals.value.steps || 10000)} />
          <div class="tiny muted mt-s">Goal {goals.value.steps.toLocaleString()}</div>
        </Card>
        <Card onClick={() => go(`/exercise?day=${t}`)}>
          <div class="row gap-s small muted">
            <Icon name="flame" size={1} style={{ color: 'var(--exercise)' }} /> Exercise
          </div>
          <div class="tile-v">
            {fmtE(s.exercise)} <small class="small muted">{eUnit()}</small>
          </div>
          <div class="small muted">{exerciseMinutes(t)} min today</div>
          <div class="tiny link mt-s">+ Add exercise</div>
        </Card>
        <Card onClick={() => openSheet('water', t)}>
          <div class="row gap-s small muted">
            <Icon name="drop" size={1} style={{ color: 'var(--water)' }} /> Water
          </div>
          <div class="tile-v">{fmtWater(water)}</div>
          <Bar value={water / (goals.value.water || 2000)} color="var(--water)" over="var(--water)" />
          <div class="tiny muted mt-s">Goal {fmtWater(goals.value.water)}</div>
        </Card>
        <Card onClick={() => (fast ? go('/fasting') : openSheet('weight', t))}>
          {fast ? (
            <>
              <div class="row gap-s small muted">
                <Icon name="timer" size={1} style={{ color: 'var(--accent)' }} /> Fasting
              </div>
              <div class="tile-v num-t">{fmtDuration(Date.now() - fast.start)}</div>
              <Bar value={(Date.now() - fast.start) / (fast.target * 3600000)} over="var(--good)" />
              <div class="tiny muted mt-s">Target {fast.target} h</div>
            </>
          ) : (
            <>
              <div class="row gap-s small muted">
                <Icon name="scale" size={1} style={{ color: 'var(--fat)' }} /> Weight
              </div>
              <div class="tile-v">{fmtW(currentWeight.value)}</div>
              <div class={`small ${p.goalType === 'gain' ? (change >= 0 ? 'good' : 'warn') : change <= 0 ? 'good' : 'warn'}`}>
                {change === 0 ? 'No change yet' : `${change > 0 ? '+' : '-'}${fmtW(Math.abs(change))} since start`}
              </div>
              <div class="tiny link mt-s">+ Log weight</div>
            </>
          )}
        </Card>
      </div>

      <Card title="Weight" icon="scale" action={<a class="small link" href="#/progress">Progress</a>}>
        <LineChart points={pts} goal={wTo(p.goalWeight)} fmtY={(v) => `${Math.round(v * 10) / 10}`} fmtX={(x) => fmtShort(dayKey(new Date(x)))} empty="Log your weight to see your trend." />
        <div class="row between small mt-s">
          <span class="muted">
            Start {fmtW(p.startWeight)} · Goal {fmtW(p.goalWeight)}
          </span>
          <span class="bold">{wUnit()}</span>
        </div>
      </Card>
    </div>
  )
}

function defaultMeal() {
  const h = new Date().getHours()
  const n = settings.value.meals.length
  return h < 11 ? 0 : h < 15 ? Math.min(1, n - 1) : h < 17 || h >= 21 ? n - 1 : Math.min(2, n - 1)
}
