import { useState } from 'preact/hooks'
import { Icon } from '../components/Icon'
import { Field, Num, Page, Seg, Sheet } from '../components/ui'
import { fmtDay } from '../lib/dates'
import { CARDIO, STRENGTH, burn } from '../lib/exercises'
import { tokens } from '../lib/foods'
import { back } from '../lib/router'
import { currentWeight, customExercises, exercises, saveCustomExercises, saveExercise, say, uid } from '../lib/store'
import type { CustomExercise, Day } from '../lib/types'
import { eFrom, eTo, eUnit, liftFrom, liftUnit } from '../lib/units'

type Pick = { name: string; kind: 'cardio' | 'strength'; met?: number; kcalPerMin?: number }

const match = (q: string, name: string) => {
  const qt = tokens(q)
  const nt = tokens(name)
  return qt.every((t) => nt.some((w) => w.startsWith(t)))
}

export function AddExercise({ day }: { day: Day }) {
  const [kind, setKind] = useState<'cardio' | 'strength'>('cardio')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [creating, setCreating] = useState(false)

  const recent = [...new Map(exercises.value.filter((x) => x.kind === kind).map((x) => [x.name, x])).values()].reverse().slice(0, 6)
  const custom = customExercises.value.filter((c) => c.kind === kind)
  const list: Pick[] =
    kind === 'cardio'
      ? [...custom.map((c) => ({ name: c.name, kind: c.kind, kcalPerMin: c.kcalPerMin })), ...CARDIO.map((c) => ({ name: c.name, kind: 'cardio' as const, met: c.met }))]
      : [...custom.map((c) => ({ name: c.name, kind: c.kind })), ...STRENGTH.map((n) => ({ name: n, kind: 'strength' as const }))]
  const shown = q.trim() ? list.filter((p) => match(q, p.name)) : list

  return (
    <Page title="Add exercise" sub={fmtDay(day)} backTo="/diary">
      <Seg
        value={kind}
        onChange={(k) => (setKind(k), setQ(''))}
        options={[
          { v: 'cardio', label: 'Cardio' },
          { v: 'strength', label: 'Strength' },
        ]}
      />
      <div class="search mt">
        <Icon name="search" />
        <input class="input" type="search" placeholder={kind === 'cardio' ? 'Search cardio, sports, activities' : 'Search exercises'} value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      </div>

      {!q && recent.length > 0 && (
        <>
          <div class="section-t">Recent</div>
          <div class="card flush">
            {recent.map((r) => (
              <button key={r.id} class="listrow" onClick={() => setPick({ name: r.name, kind: r.kind, met: r.met, kcalPerMin: r.met ? undefined : r.minutes ? r.kcal / r.minutes : undefined })}>
                <span class="grow">
                  <span class="row-t">{r.name}</span>
                  <span class="row-s">{r.kind === 'cardio' ? `${r.minutes ?? 0} min · ${Math.round(eTo(r.kcal))} ${eUnit()}` : `${r.sets} × ${r.reps}`}</span>
                </span>
                <Icon name="plus" class="accent" />
              </button>
            ))}
          </div>
        </>
      )}

      <div class="section-t">{q ? 'Results' : kind === 'cardio' ? 'All activities' : 'All exercises'}</div>
      <div class="card flush">
        {shown.slice(0, 120).map((p) => (
          <button key={p.name} class="listrow" onClick={() => setPick(p)}>
            <span class="grow">
              <span class="row-t">{p.name}</span>
              {p.met && <span class="row-s">about {Math.round(eTo(burn(p.met, currentWeight.value, 30)))} {eUnit()} per 30 min</span>}
            </span>
            <Icon name="plus" class="accent" />
          </button>
        ))}
        {shown.length === 0 && <div class="listrow muted small">No match.</div>}
        <button class="meal-add" onClick={() => setCreating(true)}>
          <Icon name="plus" size={1} stroke={2.6} /> CREATE {q ? `"${q.toUpperCase()}"` : 'AN EXERCISE'}
        </button>
      </div>

      {pick && <LogExercise pick={pick} day={day} onClose={() => setPick(null)} />}
      {creating && <CreateExercise kind={kind} name={q} onClose={() => setCreating(false)} onCreated={(c) => (setCreating(false), setPick({ name: c.name, kind: c.kind, kcalPerMin: c.kcalPerMin }))} />}
    </Page>
  )
}

function LogExercise({ pick, day, onClose }: { pick: Pick; day: Day; onClose: () => void }) {
  const [minutes, setMinutes] = useState<number | undefined>(pick.kind === 'cardio' ? 30 : undefined)
  const [kcalTyped, setKcal] = useState<number | undefined>()
  const [sets, setSets] = useState<number | undefined>(3)
  const [reps, setReps] = useState<number | undefined>(10)
  const [weight, setWeight] = useState<number | undefined>()
  const auto = pick.met ? burn(pick.met, currentWeight.value, minutes ?? 0) : pick.kcalPerMin ? Math.round(pick.kcalPerMin * (minutes ?? 0)) : pick.kind === 'strength' && minutes ? burn(5, currentWeight.value, minutes) : 0
  const kcal = kcalTyped != null ? eFrom(kcalTyped) : auto
  const save = async () => {
    await saveExercise({
      id: uid(),
      day,
      kind: pick.kind,
      name: pick.name,
      minutes: minutes || undefined,
      kcal: Math.round(kcal || 0),
      sets: pick.kind === 'strength' ? sets : undefined,
      reps: pick.kind === 'strength' ? reps : undefined,
      weight: pick.kind === 'strength' && weight ? liftFrom(weight) : undefined,
      met: pick.met,
      time: Date.now(),
    })
    say(`${pick.name} added`)
    onClose()
    back('/diary')
  }
  return (
    <Sheet
      title={pick.name}
      onClose={onClose}
      actions={
        <button class="btn primary sm" onClick={save}>
          <Icon name="check" size={1} /> Add
        </button>
      }
    >
      {pick.kind === 'strength' && (
        <div class="grid3">
          <Field label="Sets">
            <Num value={sets} onChange={setSets} autoFocus />
          </Field>
          <Field label="Reps per set">
            <Num value={reps} onChange={setReps} />
          </Field>
          <Field label={`Weight per rep`}>
            <Num value={weight} onChange={setWeight} suffix={liftUnit()} />
          </Field>
        </div>
      )}
      <div class="grid2">
        <Field label={pick.kind === 'cardio' ? 'Minutes' : 'Minutes (optional)'}>
          <Num value={minutes} onChange={setMinutes} suffix="min" autoFocus={pick.kind === 'cardio'} />
        </Field>
        <Field label={`Calories burned`} hint={kcalTyped == null && auto ? 'Estimated from your weight. Type to override.' : undefined}>
          <Num value={kcalTyped} onChange={setKcal} placeholder={auto ? String(Math.round(eTo(auto))) : '0'} suffix={eUnit()} />
        </Field>
      </div>
    </Sheet>
  )
}

function CreateExercise({ kind, name: initial, onClose, onCreated }: { kind: 'cardio' | 'strength'; name: string; onClose: () => void; onCreated: (c: CustomExercise) => void }) {
  const [name, setName] = useState(initial)
  const [kpm, setKpm] = useState<number | undefined>()
  return (
    <Sheet
      title="Create exercise"
      onClose={onClose}
      actions={
        <button
          class="btn primary sm"
          disabled={!name.trim()}
          onClick={async () => {
            const c: CustomExercise = { id: uid(), name: name.trim(), kind, kcalPerMin: kpm ? eFrom(kpm) : undefined }
            await saveCustomExercises([c, ...customExercises.value])
            onCreated(c)
          }}
        >
          Save
        </button>
      }
    >
      <Field label="Name">
        <input class="input" value={name} autoFocus onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      </Field>
      {kind === 'cardio' && (
        <Field label={`Calories burned per minute (optional)`}>
          <Num value={kpm} onChange={setKpm} suffix={eUnit()} />
        </Field>
      )}
    </Sheet>
  )
}
