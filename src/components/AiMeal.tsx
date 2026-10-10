import { useEffect, useState } from 'preact/hooks'
import { account, accountSheet, sync } from '../lib/account'
import { massUnits } from '../lib/foods'
import { scale, type Nutr } from '../lib/nutrients'
import { go } from '../lib/router'
import { logItems, mealName, saveMeal, say, settings, uid } from '../lib/store'
import type { Day, Food, Item } from '../lib/types'
import { eUnit, fmtE } from '../lib/units'
import { Icon } from './Icon'
import { Num, Sheet, Switch } from './ui'

interface AiItem {
  name: string
  restaurant: string
  portion: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  satFat: number
  sodium: number
  confidence: 'low' | 'medium' | 'high'
}

type Row = AiItem & { keep: boolean; eaten: number }

/** Shrink to Claude's sweet spot (long edge about 1568) so uploads stay small and text stays readable. */
async function prepare(blob: Blob): Promise<{ data: string; type: string }> {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const out: Blob = await new Promise((r) => c.toBlob((b) => r(b || blob), 'image/jpeg', 0.85))
  const data = await new Promise<string>((r) => {
    const fr = new FileReader()
    fr.onload = () => r(String(fr.result).split(',')[1])
    fr.readAsDataURL(out)
  })
  return { data, type: 'image/jpeg' }
}

function toFood(r: Row): Food {
  const per100 = 100 / Math.max(1, r.grams)
  const n: Nutr = scale({ kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, sugar: r.sugar, satFat: r.satFat, sodium: r.sodium }, per100)
  return {
    id: `a:${uid()}`,
    name: r.name,
    brand: r.restaurant.trim() || undefined,
    source: 'ai',
    n,
    // "1 large wrap" reads well as a serving on its own; vaguer text goes in brackets
    units: [{ label: /^1\s/.test(r.portion.trim()) ? r.portion.trim() : `1 portion (${r.portion})`, g: r.grams, f: r.grams / 100 }, ...massUnits(100)],
  }
}

export function AiMealSheet({ day, meal: initialMeal, onClose, shared }: { day: Day; meal: number; onClose: () => void; shared?: boolean }) {
  const [meal, setMeal] = useState(initialMeal)
  const [image, setImage] = useState<Blob | null>(null)
  const [preview, setPreview] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [notes, setNotes] = useState('')
  const [save, setSave] = useState(false)
  const [saveName, setSaveName] = useState('')

  useEffect(() => {
    if (!image) return setPreview('')
    const u = URL.createObjectURL(image)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [image])

  // A screenshot or text shared into Forkful from another app (see the share target in sw.js)
  useEffect(() => {
    if (!shared || !('caches' in window)) return
    caches.open('forkful-share').then(async (c) => {
      const img = await c.match('/shared-image')
      const txt = await c.match('/shared-text')
      if (img) setImage(await img.blob())
      if (txt) setText((await txt.text()).trim())
      await c.delete('/shared-image')
      await c.delete('/shared-text')
    })
  }, [shared])

  const pick = (capture: boolean) => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    if (capture) inp.setAttribute('capture', 'environment')
    inp.onchange = () => {
      const f = inp.files?.[0]
      if (f) {
        setImage(f)
        setRows(null)
      }
    }
    inp.click()
  }

  const analyse = async () => {
    setBusy(true)
    setErr('')
    try {
      const s = await sync()
      const { data } = (await s.supa?.auth.getSession()) ?? { data: { session: null } }
      const token = data.session?.access_token
      if (!token) throw new Error('Sign in again to use AI meal logging.')
      const img = image ? await prepare(image) : null
      const res = await fetch('/api/meal-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: img?.data, mediaType: img?.type, text }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`)
      const items = (j.items as AiItem[]).map((it) => ({ ...it, keep: true, eaten: Math.round(it.grams) }))
      setRows(items)
      setNotes(j.notes || '')
      const place = items.find((i) => i.restaurant)?.restaurant
      setSaveName(place ? `${place} order` : items.map((i) => i.name).slice(0, 2).join(' + '))
      if (!items.length) setErr(j.notes || 'No food found. Try another photo or describe it.')
    } catch (e) {
      setErr(navigator.onLine ? (e as Error).message : 'You are offline. AI meal logging needs a connection.')
    } finally {
      setBusy(false)
    }
  }

  const chosen = (rows ?? []).filter((r) => r.keep && r.eaten > 0)
  const total = chosen.reduce((s, r) => s + (r.kcal * r.eaten) / Math.max(1, r.grams), 0)

  const add = async () => {
    const items: Item[] = chosen.map((r) => {
      const food = toFood(r)
      return { food, qty: r.eaten / Math.max(1, r.grams), unit: 0 }
    })
    await logItems(day, meal, items)
    if (save && saveName.trim()) await saveMeal({ id: uid(), name: saveName.trim(), items, created: Date.now() })
    say(`Added ${items.length} item${items.length === 1 ? '' : 's'} to ${mealName(meal)}${save ? ', saved for next time' : ''}`)
    onClose()
    go('/diary')
  }

  if (!account.value.id)
    return (
      <Sheet title="AI meal logging" onClose={onClose}>
        <div class="center-t" style={{ padding: '0.5rem 0 1rem' }}>
          <div class="mic-pulse" style={{ width: '4rem', height: '4rem' }}>
            <Icon name="sparkle" size={1.8} />
          </div>
          <p>Snap your plate, share a screenshot of your delivery order, or just describe it. The AI lists every item with calories and macros for you to check.</p>
          <p class="small muted">It needs a free Forkful account so your scans are tied to you.</p>
        </div>
        <div class="grid2" style={{ gap: '0.5rem' }}>
          <button class="btn primary" onClick={() => (accountSheet.value = 'signup')}>
            Create account
          </button>
          <button class="btn outline" onClick={() => (accountSheet.value = 'signin')}>
            Sign in
          </button>
        </div>
      </Sheet>
    )

  return (
    <Sheet
      title="Snap or describe a meal"
      onClose={onClose}
      full
      actions={
        rows && chosen.length > 0 ? (
          <button class="btn primary sm" onClick={add}>
            Add {chosen.length}
          </button>
        ) : null
      }
    >
      {!rows && (
        <>
          {preview ? (
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <img src={preview} alt="Your meal or order" style={{ width: '100%', maxHeight: '45dvh', objectFit: 'contain', borderRadius: 'var(--radius)', background: 'var(--surface-2)' }} />
              <button class="btn sm" style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }} onClick={() => setImage(null)}>
                <Icon name="x" size={0.9} /> Remove
              </button>
            </div>
          ) : (
            <div class="grid2" style={{ gap: '0.6rem', marginBottom: '0.75rem' }}>
              <button class="card center-t" style={{ margin: 0, padding: '1.25rem 0.5rem' }} onClick={() => pick(true)}>
                <Icon name="camera" size={1.8} class="accent" />
                <div class="bold mt-s">Take a photo</div>
                <div class="tiny muted">of your plate or box</div>
              </button>
              <button class="card center-t" style={{ margin: 0, padding: '1.25rem 0.5rem' }} onClick={() => pick(false)}>
                <Icon name="image" size={1.8} class="accent" />
                <div class="bold mt-s">Pick a screenshot</div>
                <div class="tiny muted">of your Glovo or Wolt order</div>
              </button>
            </div>
          )}
          <label class="field">
            <span class="field-l">{image ? 'Anything to add? (optional)' : 'Or describe it'}</span>
            <textarea
              class="input"
              placeholder={image ? 'e.g. I only ate half the fries, no sauce' : 'e.g. Large chicken doner from Happy with fries and a Coke Zero'}
              value={text}
              onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
            />
          </label>
          {err && <p class="small danger">{err}</p>}
          <button class="btn primary block" style={{ minHeight: '3rem' }} disabled={busy || (!image && !text.trim())} onClick={analyse}>
            {busy ? (
              'Working out what you ate...'
            ) : (
              <>
                <Icon name="sparkle" size={1} /> Estimate calories
              </>
            )}
          </button>
          <p class="tiny muted center-t">
            Tip: in Glovo or Wolt, take a screenshot of the order and use Share, then Forkful. Estimates are a starting point; adjust the grams if a portion looks off.
          </p>
        </>
      )}

      {rows && (
        <>
          <div class="row between" style={{ marginBottom: '0.6rem' }}>
            <select class="input" style={{ width: 'auto' }} value={meal} onChange={(e) => setMeal(+(e.currentTarget as HTMLSelectElement).value)} aria-label="Meal">
              {settings.value.meals.map((m, i) => (
                <option key={i} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <b>
              {fmtE(total)} {eUnit()}
            </b>
          </div>
          <div class="card flush">
            {rows.map((r, i) => {
              const k = r.eaten / Math.max(1, r.grams)
              const set = (patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)))
              return (
                <div key={i} class="listrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem', opacity: r.keep ? 1 : 0.45 }}>
                  <div class="row gap-s">
                    <button class={`check ${r.keep ? 'on' : ''}`} aria-label={r.keep ? 'Leave out' : 'Include'} onClick={() => set({ keep: !r.keep })}>
                      {r.keep && <Icon name="check" size={0.85} stroke={3} />}
                    </button>
                    <input class="input" style={{ minHeight: '2.3rem', fontWeight: 600 }} value={r.name} onInput={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })} aria-label="Food name" />
                  </div>
                  <div class="row gap-s small muted" style={{ paddingLeft: '2rem' }}>
                    <span class="grow ellipsis">
                      {r.restaurant ? `${r.restaurant} · ` : ''}
                      {r.portion}
                    </span>
                    <span class={`tag ${r.confidence === 'high' ? 'good' : r.confidence === 'low' ? 'warn' : ''}`}>{r.confidence === 'high' ? 'confident' : r.confidence === 'low' ? 'rough guess' : 'estimate'}</span>
                  </div>
                  <div class="row gap-s" style={{ paddingLeft: '2rem' }}>
                    <div style={{ width: '7.5rem' }}>
                      <Num value={r.eaten} onChange={(v) => set({ eaten: v ?? 0 })} suffix="g" ariaLabel="Grams eaten" />
                    </div>
                    <span class="grow small muted">
                      C {Math.round(r.carbs * k)} · F {Math.round(r.fat * k)} · P {Math.round(r.protein * k)} g
                    </span>
                    <b class="num-t">{fmtE(r.kcal * k)}</b>
                  </div>
                </div>
              )
            })}
          </div>
          {notes && <p class="small muted">{notes}</p>}
          <div class="card">
            <div class="row between gap">
              <span>
                <b>Save as a meal</b>
                <div class="small muted">Log this exact order again in one tap next time.</div>
              </span>
              <Switch label="Save as a meal" on={save} onChange={setSave} />
            </div>
            {save && <input class="input mt-s" value={saveName} onInput={(e) => setSaveName((e.currentTarget as HTMLInputElement).value)} aria-label="Meal name" />}
          </div>
          <div class="grid2" style={{ gap: '0.5rem' }}>
            <button class="btn outline" onClick={() => setRows(null)}>
              <Icon name="left" size={1} /> Back
            </button>
            <button class="btn primary" disabled={!chosen.length} onClick={add}>
              Add {chosen.length} to {mealName(meal)}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
