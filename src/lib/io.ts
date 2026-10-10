import * as db from './db'
import { addDays, dayKey } from './dates'
import { fmtServing, itemNutr } from './foods'
import { LABEL_ORDER, NUTRIENTS, type Nutr, type NutrientKey } from './nutrients'
import { entries, exercises, loadAll, logItems, measurements, saveExercise, saveMeasurement, settings, uid } from './store'
import type { Day, Food } from './types'
import { CONSTANTS } from './units'

// ---------- download helpers ----------
export async function deliver(name: string, data: Blob) {
  const file = new File([data], name, { type: data.type })
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
  if (matchMedia('(pointer: coarse)').matches && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
const r2 = (v: number | undefined) => (v == null ? '' : Math.round(v * 100) / 100)

const nutHeader = LABEL_ORDER.map((k) => `${NUTRIENTS[k].label} (${NUTRIENTS[k].unit})`)

export function diaryCsv(from: Day, to: Day): string {
  const rows: unknown[][] = [['Date', 'Meal', 'Time', 'Food', 'Brand', 'Amount', ...nutHeader]]
  for (const e of entries.value) {
    if (e.day < from || e.day > to) continue
    const n = itemNutr(e)
    rows.push([e.day, settings.value.meals[e.meal] ?? `Meal ${e.meal + 1}`, new Date(e.time).toTimeString().slice(0, 5), e.food.name, e.food.brand ?? '', fmtServing(e.qty, e.food.units[e.unit]), ...LABEL_ORDER.map((k) => r2(n[k]))])
  }
  return csv(rows)
}

export function summaryCsv(from: Day, to: Day): string {
  const rows: unknown[][] = [['Date', 'Meal', ...nutHeader]]
  const map = new Map<string, Nutr>()
  for (const e of entries.value) {
    if (e.day < from || e.day > to) continue
    const key = `${e.day}|${e.meal}`
    const n = itemNutr(e)
    const t = map.get(key) ?? {}
    for (const k of LABEL_ORDER) if (n[k] != null) t[k] = (t[k] ?? 0) + (n[k] as number)
    map.set(key, t)
  }
  for (const [key, n] of [...map.entries()].sort()) {
    const [day, meal] = key.split('|')
    rows.push([day, settings.value.meals[+meal] ?? `Meal ${+meal + 1}`, ...LABEL_ORDER.map((k) => r2(n[k]))])
  }
  return csv(rows)
}

export function exerciseCsv(from: Day, to: Day): string {
  const rows: unknown[][] = [['Date', 'Exercise', 'Type', 'Minutes', 'Calories', 'Sets', 'Reps per set', 'Weight (kg)', 'Note']]
  for (const x of exercises.value) if (x.day >= from && x.day <= to) rows.push([x.day, x.name, x.kind, x.minutes ?? '', x.kcal, x.sets ?? '', x.reps ?? '', x.weight ?? '', x.note ?? ''])
  return csv(rows)
}

export function measurementCsv(): string {
  const rows: unknown[][] = [['Date', 'Measurement', 'Value', 'Unit']]
  for (const m of measurements.value) rows.push([m.day, m.key, r2(m.value), m.key === 'weight' ? 'kg' : m.key === 'bodyFat' ? '%' : 'cm'])
  return csv(rows)
}

// ---------- full backup ----------
const blobToData = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(b)
  })

export async function backupJson(): Promise<Blob> {
  const out: Record<string, unknown> = { app: 'forkful', version: 1, exported: new Date().toISOString() }
  for (const s of db.ALL_STORES) {
    const rows = await db.getAll<Record<string, unknown>>(s)
    if (s === 'photos') out[s] = await Promise.all(rows.map(async (p) => ({ ...p, blob: await blobToData(p.blob as Blob) })))
    else out[s] = rows
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' })
}

export async function restoreJson(text: string) {
  const data = JSON.parse(text)
  if (data?.app !== 'forkful') throw new Error('Not a Forkful backup file')
  for (const s of db.ALL_STORES) {
    const rows = data[s]
    if (!Array.isArray(rows)) continue
    await db.clear(s)
    if (s === 'photos') {
      const fixed = await Promise.all(rows.map(async (p: { blob: string }) => ({ ...p, blob: await (await fetch(p.blob)).blob() })))
      await db.putMany(s, fixed)
    } else await db.putMany(s, rows)
  }
  await loadAll()
}

export async function wipeAll() {
  for (const s of db.ALL_STORES) await db.clear(s)
  await db.clear('cache')
  await loadAll()
}

// ---------- CSV import (MyFitnessPal exports and others) ----------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const HEAD_MAP: [RegExp, NutrientKey][] = [
  [/^calories|^energy/i, 'kcal'],
  [/^fat|^total fat/i, 'fat'],
  [/^saturated/i, 'satFat'],
  [/^polyunsaturated/i, 'polyFat'],
  [/^monounsaturated/i, 'monoFat'],
  [/^trans/i, 'transFat'],
  [/^cholesterol/i, 'chol'],
  [/^sodium/i, 'sodium'],
  [/^potassium/i, 'potassium'],
  [/^carbohydrates|^carbs/i, 'carbs'],
  [/^fiber|^fibre/i, 'fiber'],
  [/^sugar/i, 'sugar'],
  [/^protein/i, 'protein'],
  [/^vitamin a/i, 'vitA'],
  [/^vitamin c/i, 'vitC'],
  [/^vitamin d/i, 'vitD'],
  [/^calcium/i, 'calcium'],
  [/^iron/i, 'iron'],
]

// MyFitnessPal exports vitamins and minerals as % of daily value.
const PCT_DV: Partial<Record<NutrientKey, number>> = { vitA: 900, vitC: 90, calcium: 1300, iron: 18, vitD: 20 }

function normDate(s: string): Day | null {
  s = s.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    // assume month/day like MFP's US exports unless the first part cannot be a month
    const [mo, d] = +m[1] > 12 ? [+m[2], +m[1]] : [+m[1], +m[2]]
    return dayKey(new Date(y, mo - 1, d, 12))
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : dayKey(new Date(t))
}

export interface ImportResult {
  meals: number
  weights: number
  exercises: number
}

export async function importCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('The file is empty')
  const head = rows[0].map((h) => h.trim())
  const col = (re: RegExp) => head.findIndex((h) => re.test(h))
  const iDate = col(/^date$/i)
  if (iDate < 0) throw new Error('No Date column found')
  const res: ImportResult = { meals: 0, weights: 0, exercises: 0 }
  const iMeal = col(/^meal$/i)
  const iEx = col(/^exercise$/i)
  const iWeight = col(/^weight/i)

  if (iMeal >= 0) {
    const map = HEAD_MAP.map(([re, key]) => [head.findIndex((h) => re.test(h)), key] as const).filter(([i]) => i >= 0)
    const names = settings.value.meals.map((m) => m.toLowerCase())
    for (const r of rows.slice(1)) {
      const day = normDate(r[iDate] ?? '')
      if (!day) continue
      const n: Nutr = {}
      for (const [i, key] of map) {
        const v = parseFloat(r[i])
        if (Number.isNaN(v)) continue
        n[key] = PCT_DV[key] && /^(vitamin|calcium|iron)/i.test(head[i]) && !/mg|µg|mcg/i.test(head[i]) ? (v / 100) * (PCT_DV[key] as number) : v
      }
      if (!n.kcal && !n.protein && !n.carbs && !n.fat) continue
      const mealName = (r[iMeal] ?? '').trim()
      let meal = names.indexOf(mealName.toLowerCase())
      if (meal < 0) meal = /break/i.test(mealName) ? 0 : /lunch/i.test(mealName) ? 1 : /dinner|supper/i.test(mealName) ? 2 : names.length - 1
      const food: Food = { id: `q:${uid()}`, name: `Imported ${mealName || 'meal'}`, source: 'quick', n, units: [{ label: '1 serving', f: 1 }] }
      await logItems(day, meal, [{ food, qty: 1, unit: 0 }])
      res.meals++
    }
  } else if (iEx >= 0) {
    const iKcal = col(/calories/i)
    const iMin = col(/minutes/i)
    const iSets = col(/^sets/i)
    const iReps = col(/reps/i)
    const iKg = col(/kilograms|weight|lbs|pounds/i)
    const lbs = iKg >= 0 && /lbs|pounds/i.test(head[iKg])
    for (const r of rows.slice(1)) {
      const day = normDate(r[iDate] ?? '')
      if (!day || !r[iEx]?.trim()) continue
      const sets = parseFloat(r[iSets])
      const w = parseFloat(r[iKg])
      await saveExercise({
        id: uid(),
        day,
        kind: sets > 0 ? 'strength' : 'cardio',
        name: r[iEx].trim(),
        minutes: parseFloat(r[iMin]) || undefined,
        kcal: Math.round(parseFloat(r[iKcal]) || 0),
        sets: sets || undefined,
        reps: parseFloat(r[iReps]) || undefined,
        weight: w ? (lbs ? w / CONSTANTS.LB : w) : undefined,
        time: new Date(`${day}T12:00`).getTime(),
      })
      res.exercises++
    }
  } else if (iWeight >= 0) {
    const lb = /lb|pound/i.test(head[iWeight]) || (!/kg/i.test(head[iWeight]) && settings.value.weightUnit !== 'kg')
    const iFat = col(/body ?fat/i)
    for (const r of rows.slice(1)) {
      const day = normDate(r[iDate] ?? '')
      const v = parseFloat(r[iWeight])
      if (!day) continue
      if (v > 0) {
        await saveMeasurement({ id: uid(), day, key: 'weight', value: lb ? v / CONSTANTS.LB : v })
        res.weights++
      }
      const bf = parseFloat(r[iFat])
      if (iFat >= 0 && bf > 0) await saveMeasurement({ id: uid(), day, key: 'bodyFat', value: bf })
    }
  } else throw new Error('Unrecognised CSV. Expected a Meal, Exercise or Weight column.')
  return res
}

export function lastNDays(n: number): [Day, Day] {
  const to = dayKey()
  return [addDays(to, -(n - 1)), to]
}
