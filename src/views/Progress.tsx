import { useEffect, useState } from 'preact/hooks'
import { LineChart } from '../components/charts'
import { Icon } from '../components/Icon'
import { Bar, Card, Chip, Empty, Field, Num, Page, Seg, Sheet, confirmBox } from '../components/ui'
import * as db from '../lib/db'
import { addDays, dayKey, fmtDay, fmtShort, parseDay, today } from '../lib/dates'
import { addPhoto, currentWeight, deleteMeasurement, deletePhoto, measurements, photoIndex, profile, saveMeasurement, say, uid } from '../lib/store'
import type { MeasureKey, Photo } from '../lib/types'
import { openSheet } from '../lib/uiState'
import { fmtLen, fmtW, lenFrom, lenTo, lenUnit, wTo, wUnit } from '../lib/units'

const RANGES = [
  { v: 30, label: '1M' },
  { v: 90, label: '3M' },
  { v: 180, label: '6M' },
  { v: 365, label: '1Y' },
  { v: 0, label: 'All' },
]

const MEASURES: { key: Exclude<MeasureKey, 'weight'>; label: string }[] = [
  { key: 'bodyFat', label: 'Body fat' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'chest', label: 'Chest' },
  { key: 'neck', label: 'Neck' },
  { key: 'arm', label: 'Arm' },
  { key: 'thigh', label: 'Thigh' },
]

export function ProgressView() {
  const [tab, setTab] = useState<'weight' | 'body' | 'photos'>('weight')
  return (
    <Page
      title="Progress"
      backTo={null}
      actions={
        <a class="btn sm ghost" href="#/reports">
          <Icon name="bars" size={1} /> Reports
        </a>
      }
    >
      <Seg
        value={tab}
        onChange={setTab}
        options={[
          { v: 'weight', label: 'Weight' },
          { v: 'body', label: 'Measurements' },
          { v: 'photos', label: 'Photos' },
        ]}
      />
      <div class="mt">
        {tab === 'weight' && <WeightTab />}
        {tab === 'body' && <BodyTab />}
        {tab === 'photos' && <PhotosTab />}
      </div>
    </Page>
  )
}

function WeightTab() {
  const [range, setRange] = useState(90)
  const p = profile.value!
  const all = measurements.value.filter((m) => m.key === 'weight')
  const since = range ? addDays(today(), -range) : '0000'
  const list = all.filter((m) => m.day >= since)
  const cur = currentWeight.value
  const total = Math.abs(p.startWeight - p.goalWeight)
  const done = p.goalType === 'lose' ? p.startWeight - cur : p.goalType === 'gain' ? cur - p.startWeight : 0
  const share = total ? Math.max(0, done / total) : 1
  return (
    <>
      <Card>
        <div class="row between">
          <div>
            <div class="small muted">Current</div>
            <div class="big">{fmtW(cur)}</div>
          </div>
          <button class="btn primary" onClick={() => openSheet('weight', today())}>
            <Icon name="plus" size={1} /> Log weight
          </button>
        </div>
        <div class="chips mt">
          {RANGES.map((r) => (
            <Chip key={r.v} on={range === r.v} onClick={() => setRange(r.v)}>
              {r.label}
            </Chip>
          ))}
        </div>
        <div class="mt">
          <LineChart points={list.map((m) => ({ x: parseDay(m.day).getTime(), y: wTo(m.value) }))} goal={wTo(p.goalWeight)} fmtY={(v) => `${Math.round(v * 10) / 10}`} fmtX={(x) => fmtShort(dayKey(new Date(x)))} height={13} />
        </div>
        <div class="tiny muted right-t">{wUnit()} · dashed line is your goal</div>
      </Card>

      {p.goalType !== 'maintain' && (
        <Card title="Goal progress">
          <div class="grid3 center-t">
            <div>
              <div class="tiny muted">Start</div>
              <b>{fmtW(p.startWeight)}</b>
            </div>
            <div>
              <div class="tiny muted">{done >= 0 ? (p.goalType === 'lose' ? 'Lost' : 'Gained') : 'Change'}</div>
              <b class={done >= 0 ? 'good' : 'warn'}>{fmtW(Math.abs(done))}</b>
            </div>
            <div>
              <div class="tiny muted">Goal</div>
              <b>{fmtW(p.goalWeight)}</b>
            </div>
          </div>
          <div class="mt">
            <Bar value={share} over="var(--good)" />
          </div>
          <div class="small muted mt-s">{share >= 1 ? 'Goal reached. Time to set a new one in Goals.' : `${Math.round(share * 100)}% of the way, ${fmtW(Math.max(0, total - done))} to go.`}</div>
        </Card>
      )}

      <div class="section-t">Entries</div>
      <div class="card flush">
        {all.length === 0 && <div class="listrow muted small">No weigh-ins yet.</div>}
        {[...all].reverse().map((m, i, arr) => {
          const prev = arr[i + 1]
          const diff = prev ? m.value - prev.value : 0
          return (
            <div key={m.id} class="listrow">
              <span class="grow">
                <span class="row-t">{fmtW(m.value)}</span>
                <span class="row-s">{fmtDay(m.day)}</span>
              </span>
              {prev && diff !== 0 && <span class={`small ${diff < 0 ? (p.goalType === 'gain' ? 'warn' : 'good') : p.goalType === 'gain' ? 'good' : 'warn'}`}>{`${diff > 0 ? '+' : '-'}${fmtW(Math.abs(diff))}`}</span>}
              <button
                class="btn ghost icon sm"
                aria-label="Delete"
                onClick={async () => {
                  if (await confirmBox('Delete this weigh-in?', undefined, 'Delete', true)) deleteMeasurement(m.id)
                }}
              >
                <Icon name="trash" size={1} />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

function BodyTab() {
  const [key, setKey] = useState<Exclude<MeasureKey, 'weight'>>('waist')
  const [v, setV] = useState<number | undefined>()
  const [d, setD] = useState(today())
  const pct = key === 'bodyFat'
  const list = measurements.value.filter((m) => m.key === key)
  const fmt = (x: number) => (pct ? `${Math.round(x * 10) / 10}%` : fmtLen(x))
  return (
    <>
      <div class="chips">
        {MEASURES.map((m) => (
          <Chip key={m.key} on={key === m.key} onClick={() => setKey(m.key)}>
            {m.label}
          </Chip>
        ))}
      </div>
      <Card style={{ marginTop: '0.85rem' }}>
        <LineChart points={list.map((m) => ({ x: parseDay(m.day).getTime(), y: pct ? m.value : lenTo(m.value) }))} fmtY={(x) => `${Math.round(x * 10) / 10}`} fmtX={(x) => fmtShort(dayKey(new Date(x)))} color="var(--fat)" empty={`No ${MEASURES.find((m) => m.key === key)!.label.toLowerCase()} entries yet.`} />
        <div class="grid2 mt">
          <Field label="New value">
            <Num value={v} onChange={setV} suffix={pct ? '%' : lenUnit()} />
          </Field>
          <Field label="Date">
            <input class="input" type="date" value={d} max={today()} onChange={(e) => setD((e.currentTarget as HTMLInputElement).value || today())} />
          </Field>
        </div>
        <button
          class="btn primary block"
          disabled={!v}
          onClick={async () => {
            if (!v) return
            await saveMeasurement({ id: uid(), day: d, key, value: pct ? v : lenFrom(v) })
            setV(undefined)
            say('Saved')
          }}
        >
          Save
        </button>
      </Card>
      <div class="card flush">
        {[...list].reverse().map((m) => (
          <div key={m.id} class="listrow">
            <span class="grow">
              <span class="row-t">{fmt(m.value)}</span>
              <span class="row-s">{fmtDay(m.day)}</span>
            </span>
            <button class="btn ghost icon sm" aria-label="Delete" onClick={() => deleteMeasurement(m.id)}>
              <Icon name="trash" size={1} />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const max = 1280
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((resolve) => c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.82))
}

function usePhoto(id: string | null) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!id) return
    let u = ''
    db.get<Photo>('photos', id).then((p) => {
      if (p) {
        u = URL.createObjectURL(p.blob)
        setUrl(u)
      }
    })
    return () => u && URL.revokeObjectURL(u)
  }, [id])
  return url
}

function Thumb({ id, day, on, onClick }: { id: string; day: string; on: boolean; onClick: () => void }) {
  const url = usePhoto(id)
  return (
    <button class={on ? 'on' : ''} onClick={onClick}>
      {url && <img src={url} alt={`Progress photo ${fmtDay(day)}`} loading="lazy" />}
      <span>{fmtShort(day)}</span>
    </button>
  )
}

function PhotosTab() {
  const [sel, setSel] = useState<string[]>([])
  const [view, setView] = useState<string | null>(null)
  const list = [...photoIndex.value].reverse()
  const pick = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-2))
  const a = usePhoto(sel.length === 2 ? sel[0] : null)
  const b = usePhoto(sel.length === 2 ? sel[1] : null)
  const big = usePhoto(view)
  return (
    <>
      <label class="btn primary block" style={{ position: 'relative' }}>
        <Icon name="camera" size={1} /> Add a progress photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ position: 'absolute', inset: 0, opacity: 0 }}
          onChange={async (e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0]
            if (!f) return
            await addPhoto(today(), await shrink(f))
            say('Photo saved on this device')
          }}
        />
      </label>
      <p class="tiny muted center-t">Photos never leave your phone. Tap two photos to compare them side by side.</p>
      {list.length === 0 ? (
        <Empty icon="camera" title="No photos yet">
          A photo every couple of weeks shows changes the scale misses.
        </Empty>
      ) : (
        <div class="photo-grid">
          {list.map((p) => (
            <Thumb key={p.id} id={p.id} day={p.day} on={sel.includes(p.id)} onClick={() => pick(p.id)} />
          ))}
        </div>
      )}
      {sel.length === 1 && (
        <div class="row gap-s mt">
          <button class="btn outline grow" onClick={() => setView(sel[0])}>
            <Icon name="image" size={1} /> View
          </button>
          <button
            class="btn ghost danger"
            onClick={async () => {
              if (await confirmBox('Delete this photo?', undefined, 'Delete', true)) {
                await deletePhoto(sel[0])
                setSel([])
              }
            }}
          >
            <Icon name="trash" size={1} /> Delete
          </button>
        </div>
      )}
      {sel.length === 2 && (
        <Card title="Compare" style={{ marginTop: '0.85rem' }}>
          <div class="compare">
            {[sel[0], sel[1]].map((id, i) => {
              const p = photoIndex.value.find((x) => x.id === id)
              return (
                <div key={id}>
                  {(i ? b : a) && <img src={i ? b : a} alt="" />}
                  <div class="tiny muted center-t">{p ? fmtDay(p.day) : ''}</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
      {view && (
        <Sheet title="Photo" onClose={() => setView(null)}>
          {big && <img src={big} alt="" style={{ width: '100%', borderRadius: '0.75rem' }} />}
        </Sheet>
      )}
    </>
  )
}
