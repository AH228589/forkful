import { useEffect, useState } from 'preact/hooks'
import { Icon } from '../components/Icon'
import { Card, Chip, Empty, Field, Page, Ring, Sheet, confirmBox } from '../components/ui'
import { fmtDuration } from '../lib/dates'
import { activeFast, deleteFast, fasts, saveFast, saveSettings, settings, startFast } from '../lib/store'
import type { Fast } from '../lib/types'

const PRESETS = [
  { h: 13, label: '13:11' },
  { h: 14, label: '14:10' },
  { h: 16, label: '16:8' },
  { h: 18, label: '18:6' },
  { h: 20, label: '20:4' },
  { h: 23, label: 'OMAD' },
  { h: 36, label: '36 h' },
]

const toLocal = (ms: number) => {
  const d = new Date(ms)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const fromLocal = (s: string) => new Date(s).getTime()

function stage(h: number) {
  if (h < 4) return 'Digesting your last meal'
  if (h < 12) return 'Blood sugar settling'
  if (h < 16) return 'Switching to fat burning'
  if (h < 24) return 'Deep in fat burning'
  return 'Extended fast. Stay hydrated.'
}

export function Fasting() {
  const [, tick] = useState(0)
  const [edit, setEdit] = useState<Fast | null>(null)
  const f = activeFast.value
  const target = settings.value.fastPreset
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const done = fasts.value.filter((x) => x.end).reverse()
  const elapsed = f ? Date.now() - f.start : 0
  const hours = done.map((x) => (x.end! - x.start) / 3600000)
  const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0
  const longest = hours.length ? Math.max(...hours) : 0
  const hit = done.filter((x) => (x.end! - x.start) / 3600000 >= x.target).length

  return (
    <Page title="Intermittent fasting" backTo="/more">
      <Card class="center-t">
        <div class="fast-ring" style={{ display: 'grid', placeItems: 'center', padding: '0.5rem 0 1rem' }}>
          <Ring share={f ? elapsed / (f.target * 3600000) : 0} size={13} stroke={7} color={f && elapsed >= f.target * 3600000 ? 'var(--good)' : 'var(--accent)'}>
            <div>
              <div class="tiny muted">{f ? (elapsed >= f.target * 3600000 ? 'Goal reached' : 'Fasting for') : 'Not fasting'}</div>
              <b>{f ? fmtDuration(elapsed) : '0:00:00'}</b>
              <div class="tiny muted">{f ? `goal ${f.target} h` : `${target} h plan`}</div>
            </div>
          </Ring>
        </div>
        {f && <p class="small ink2">{stage(elapsed / 3600000)}</p>}
        {f && (
          <p class="small muted">
            Started {new Date(f.start).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ends {new Date(f.start + f.target * 3600000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
        {!f && (
          <div class="chips" style={{ justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            {PRESETS.map((p) => (
              <Chip key={p.h} on={target === p.h} onClick={() => saveSettings({ fastPreset: p.h })}>
                {p.label}
              </Chip>
            ))}
          </div>
        )}
        <div class="row gap-s center">
          {f ? (
            <>
              <button class="btn outline" onClick={() => setEdit(f)}>
                <Icon name="edit" size={1} /> Edit start
              </button>
              <button class="btn primary" onClick={() => saveFast({ ...f, end: Date.now() })}>
                End fast
              </button>
            </>
          ) : (
            <button class="btn primary" onClick={() => startFast(target)}>
              <Icon name="timer" size={1} /> Start {target} h fast
            </button>
          )}
        </div>
      </Card>

      {done.length > 0 && (
        <Card title="Stats">
          <div class="grid3 center-t">
            <div>
              <div class="tile-v">{avg.toFixed(1)} h</div>
              <div class="tiny muted">Average</div>
            </div>
            <div>
              <div class="tile-v">{longest.toFixed(1)} h</div>
              <div class="tiny muted">Longest</div>
            </div>
            <div>
              <div class="tile-v">
                {hit}/{done.length}
              </div>
              <div class="tiny muted">Goals hit</div>
            </div>
          </div>
        </Card>
      )}

      <div class="section-t">History</div>
      <div class="card flush">
        {done.length === 0 ? (
          <Empty icon="timer" title="No fasts yet">
            Start a fast after your last meal of the day.
          </Empty>
        ) : (
          done.map((x) => {
            const h = (x.end! - x.start) / 3600000
            return (
              <button key={x.id} class="listrow" onClick={() => setEdit(x)}>
                <span class="grow">
                  <span class="row-t">
                    {Math.floor(h)} h {Math.round((h % 1) * 60)} min
                  </span>
                  <span class="row-s">
                    {new Date(x.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · goal {x.target} h
                  </span>
                </span>
                {h >= x.target ? <Icon name="check" class="good" /> : <span class="tiny muted">{Math.round((h / x.target) * 100)}%</span>}
              </button>
            )
          })
        )}
      </div>
      {edit && <EditFast fast={edit} onClose={() => setEdit(null)} />}
    </Page>
  )
}

function EditFast({ fast, onClose }: { fast: Fast; onClose: () => void }) {
  const [start, setStart] = useState(toLocal(fast.start))
  const [end, setEnd] = useState(fast.end ? toLocal(fast.end) : '')
  const [target, setTarget] = useState(fast.target)
  return (
    <Sheet
      title="Edit fast"
      onClose={onClose}
      actions={
        <button
          class="btn primary sm"
          onClick={async () => {
            await saveFast({ ...fast, start: fromLocal(start), end: end ? fromLocal(end) : undefined, target })
            onClose()
          }}
        >
          Save
        </button>
      }
    >
      <Field label="Started">
        <input class="input" type="datetime-local" value={start} onChange={(e) => setStart((e.currentTarget as HTMLInputElement).value)} />
      </Field>
      {fast.end && (
        <Field label="Ended">
          <input class="input" type="datetime-local" value={end} onChange={(e) => setEnd((e.currentTarget as HTMLInputElement).value)} />
        </Field>
      )}
      <Field label="Goal (hours)">
        <select class="input" value={target} onChange={(e) => setTarget(+(e.currentTarget as HTMLSelectElement).value)}>
          {[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 36, 48, 72].map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </select>
      </Field>
      <button
        class="btn ghost danger block"
        onClick={async () => {
          if (await confirmBox('Delete this fast?', undefined, 'Delete', true)) {
            await deleteFast(fast.id)
            onClose()
          }
        }}
      >
        <Icon name="trash" size={1} /> Delete
      </button>
    </Sheet>
  )
}
