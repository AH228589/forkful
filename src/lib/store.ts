import { computed, signal } from '@preact/signals'
import * as db from './db'
import { addDays, dayKey, today } from './dates'
import type { CustomExercise, Day, DayLog, Entry, Exercise, Fast, Food, Goals, Item, Measurement, Profile, Recipe, SavedMeal, Settings } from './types'

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

const imperial = /^en-(US|LR|MM)/i.test(navigator.language)

export const DEFAULT_SETTINGS: Settings = {
  weightUnit: imperial ? 'lb' : 'kg',
  heightUnit: imperial ? 'ftin' : 'cm',
  energyUnit: 'kcal',
  waterUnit: imperial ? 'floz' : 'ml',
  lengthUnit: imperial ? 'in' : 'cm',
  theme: 'system',
  meals: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'],
  exerciseCalories: true,
  stepCalories: false,
  netCarbs: false,
  timestamps: false,
  weekStart: 1,
  diaryCols: ['carbs', 'fat', 'protein', 'sodium', 'sugar'],
  dashCustom: ['fiber', 'sugar', 'sodium'],
  mealMacros: false,
  reminders: [
    { id: 'r1', label: 'Log breakfast', time: '09:00', on: false },
    { id: 'r2', label: 'Log lunch', time: '13:00', on: false },
    { id: 'r3', label: 'Log dinner', time: '19:30', on: false },
    { id: 'r4', label: 'Weigh in', time: '07:30', on: false },
  ],
  fastPreset: 16,
}

export const DEFAULT_GOALS: Goals = {
  kcal: null,
  byDay: null,
  carbs: 0.5,
  protein: 0.2,
  fat: 0.3,
  macroMode: 'pct',
  nutrients: {},
  water: 2000,
  workoutsPerWeek: 3,
  minutesPerWorkout: 30,
  exerciseKcalPerWeek: 1200,
  steps: 10000,
}

export const ready = signal(false)
export const profile = signal<Profile | null>(null)
export const goals = signal<Goals>(DEFAULT_GOALS)
export const settings = signal<Settings>(DEFAULT_SETTINGS)
export const entries = signal<Entry[]>([])
export const exercises = signal<Exercise[]>([])
export const days = signal<Record<Day, DayLog>>({})
export const measurements = signal<Measurement[]>([])
export const foods = signal<Food[]>([])
export const recipes = signal<Recipe[]>([])
export const meals = signal<SavedMeal[]>([])
export const fasts = signal<Fast[]>([])
export const customExercises = signal<CustomExercise[]>([])
export const photoIndex = signal<{ id: string; day: Day }[]>([])
export const diaryDay = signal<Day>(today())

// ---- toast ----
export const toast = signal<{ id: number; text: string; action?: { label: string; fn: () => void } } | null>(null)
let toastTimer = 0
export function say(text: string, action?: { label: string; fn: () => void }) {
  clearTimeout(toastTimer)
  toast.value = { id: Date.now(), text, action }
  toastTimer = window.setTimeout(() => (toast.value = null), action ? 5000 : 2600)
}

// ---- load ----
export async function loadAll() {
  const [p, g, s, e, x, d, m, f, r, ml, fa, ce, ph] = await Promise.all([
    db.kvGet<Profile>('profile'),
    db.kvGet<Goals>('goals'),
    db.kvGet<Settings>('settings'),
    db.getAll<Entry>('entries'),
    db.getAll<Exercise>('exercises'),
    db.getAll<DayLog>('days'),
    db.getAll<Measurement>('measurements'),
    db.getAll<Food>('foods'),
    db.getAll<Recipe>('recipes'),
    db.getAll<SavedMeal>('meals'),
    db.getAll<Fast>('fasts'),
    db.kvGet<CustomExercise[]>('customExercises'),
    db.kvGet<{ id: string; day: Day }[]>('photoIndex'),
  ])
  profile.value = p ?? null
  goals.value = { ...DEFAULT_GOALS, ...(g || {}) }
  settings.value = { ...DEFAULT_SETTINGS, ...(s || {}) }
  entries.value = e.sort(byOrder)
  exercises.value = x.sort((a, b) => a.time - b.time)
  days.value = Object.fromEntries(d.map((row) => [row.day, row]))
  measurements.value = m.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  foods.value = f.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
  recipes.value = r.sort((a, b) => b.updated - a.updated)
  meals.value = ml.sort((a, b) => b.created - a.created)
  fasts.value = fa.sort((a, b) => a.start - b.start)
  customExercises.value = ce ?? []
  photoIndex.value = ph ?? []
  ready.value = true
  db.persist()
}

const byOrder = (a: Entry, b: Entry) => (a.day === b.day ? (a.meal === b.meal ? a.order - b.order : a.meal - b.meal) : a.day < b.day ? -1 : 1)

// ---- indexes ----
export const entriesByDay = computed(() => {
  const m = new Map<Day, Entry[]>()
  for (const e of entries.value) {
    const list = m.get(e.day)
    if (list) list.push(e)
    else m.set(e.day, [e])
  }
  return m
})

export const exercisesByDay = computed(() => {
  const m = new Map<Day, Exercise[]>()
  for (const e of exercises.value) {
    const list = m.get(e.day)
    if (list) list.push(e)
    else m.set(e.day, [e])
  }
  return m
})

export const weights = computed(() => measurements.value.filter((m) => m.key === 'weight'))

export const currentWeight = computed(() => {
  const w = weights.value
  return w.length ? w[w.length - 1].value : (profile.value?.startWeight ?? 70)
})

/** Foods used before, most recent first, with how often. */
export const history = computed(() => {
  const seen = new Map<string, { food: Food; last: number; count: number; qty: number; unit: number; meal: number }>()
  for (const e of entries.value) {
    if (e.food.source === 'quick') continue
    const key = e.food.id
    const s = seen.get(key)
    if (!s) seen.set(key, { food: e.food, last: e.time, count: 1, qty: e.qty, unit: e.unit, meal: e.meal })
    else {
      s.count++
      if (e.time >= s.last) Object.assign(s, { last: e.time, food: e.food, qty: e.qty, unit: e.unit, meal: e.meal })
    }
  }
  return [...seen.values()]
})

export const streak = computed(() => {
  const by = entriesByDay.value
  let d = today()
  if (!by.has(d)) d = addDays(d, -1)
  let n = 0
  while (by.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
})

// ---- entries ----
function nextOrder(day: Day, meal: number) {
  let o = 0
  for (const e of entriesByDay.value.get(day) ?? []) if (e.meal === meal) o = Math.max(o, e.order + 1)
  return o
}

function nowOn(day: Day) {
  const t = today()
  if (day === t) return Date.now()
  const d = new Date()
  const [y, m, dd] = day.split('-').map(Number)
  d.setFullYear(y, m - 1, dd)
  return d.getTime()
}

export async function logItems(day: Day, meal: number, items: Item[], time?: number) {
  let o = nextOrder(day, meal)
  const add: Entry[] = items.map((it) => ({ id: uid(), day, meal, food: slim(it.food), qty: it.qty, unit: it.unit, time: time ?? nowOn(day), order: o++ }))
  entries.value = [...entries.value, ...add].sort(byOrder)
  await db.putMany('entries', add)
  return add
}

/** Keep entry snapshots small: drop image urls of big search results etc. */
function slim(f: Food): Food {
  const { created: _c, updated: _u, ...rest } = f
  return rest
}

export async function updateEntry(e: Entry) {
  entries.value = entries.value.map((x) => (x.id === e.id ? e : x)).sort(byOrder)
  await db.put('entries', e)
}

export async function deleteEntries(ids: string[], undoable = true) {
  const gone = entries.value.filter((e) => ids.includes(e.id))
  entries.value = entries.value.filter((e) => !ids.includes(e.id))
  await db.delMany('entries', ids)
  if (undoable && gone.length)
    say(gone.length === 1 ? `Removed ${gone[0].food.name}` : `Removed ${gone.length} foods`, {
      label: 'Undo',
      fn: async () => {
        entries.value = [...entries.value, ...gone].sort(byOrder)
        await db.putMany('entries', gone)
      },
    })
}

export async function moveEntries(ids: string[], day: Day, meal: number) {
  let o = nextOrder(day, meal)
  const changed: Entry[] = []
  entries.value = entries.value
    .map((e) => {
      if (!ids.includes(e.id)) return e
      const n = { ...e, day, meal, order: o++ }
      changed.push(n)
      return n
    })
    .sort(byOrder)
  await db.putMany('entries', changed)
}

export async function copyEntries(list: Entry[], day: Day, meal?: number) {
  const byMeal = new Map<number, Item[]>()
  for (const e of list) {
    const m = meal ?? e.meal
    const arr = byMeal.get(m) ?? []
    arr.push({ food: e.food, qty: e.qty, unit: e.unit })
    byMeal.set(m, arr)
  }
  for (const [m, items] of byMeal) await logItems(day, m, items)
}

// ---- exercise ----
export async function saveExercise(x: Exercise) {
  const has = exercises.value.some((e) => e.id === x.id)
  exercises.value = (has ? exercises.value.map((e) => (e.id === x.id ? x : e)) : [...exercises.value, x]).sort((a, b) => a.time - b.time)
  await db.put('exercises', x)
}

export async function deleteExercise(id: string) {
  const gone = exercises.value.find((e) => e.id === id)
  exercises.value = exercises.value.filter((e) => e.id !== id)
  await db.del('exercises', id)
  if (gone)
    say(`Removed ${gone.name}`, {
      label: 'Undo',
      fn: () => saveExercise(gone),
    })
}

export async function saveCustomExercises(list: CustomExercise[]) {
  customExercises.value = list
  await db.kvSet('customExercises', list)
}

// ---- day logs ----
export function dayLog(day: Day): DayLog {
  return days.value[day] ?? { day }
}

export async function patchDay(day: Day, patch: Partial<DayLog>) {
  const row = { ...dayLog(day), ...patch, day }
  days.value = { ...days.value, [day]: row }
  await db.put('days', row)
}

// ---- measurements ----
export async function saveMeasurement(m: Measurement) {
  // one value per key per day
  const others = measurements.value.filter((x) => !(x.key === m.key && x.day === m.day) && x.id !== m.id)
  const replaced = measurements.value.filter((x) => x.key === m.key && x.day === m.day && x.id !== m.id)
  measurements.value = [...others, m].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  await db.delMany(
    'measurements',
    replaced.map((r) => r.id),
  )
  await db.put('measurements', m)
}

export async function deleteMeasurement(id: string) {
  measurements.value = measurements.value.filter((m) => m.id !== id)
  await db.del('measurements', id)
}

export async function logWeight(kg: number, day: Day = today()) {
  await saveMeasurement({ id: uid(), day, key: 'weight', value: kg })
}

// ---- photos ----
export async function addPhoto(day: Day, blob: Blob, note?: string) {
  const id = uid()
  await db.put('photos', { id, day, blob, note })
  photoIndex.value = [...photoIndex.value, { id, day }].sort((a, b) => (a.day < b.day ? -1 : 1))
  await db.kvSet('photoIndex', photoIndex.value)
}

export async function deletePhoto(id: string) {
  await db.del('photos', id)
  photoIndex.value = photoIndex.value.filter((p) => p.id !== id)
  await db.kvSet('photoIndex', photoIndex.value)
}

// ---- foods / recipes / meals ----
export async function saveFood(f: Food) {
  const row = { ...f, updated: Date.now(), created: f.created ?? Date.now() }
  foods.value = [row, ...foods.value.filter((x) => x.id !== f.id)]
  await db.put('foods', row)
  return row
}

export async function deleteFood(id: string) {
  foods.value = foods.value.filter((f) => f.id !== id)
  await db.del('foods', id)
}

export async function saveRecipe(r: Recipe) {
  const row = { ...r, updated: Date.now() }
  recipes.value = [row, ...recipes.value.filter((x) => x.id !== r.id)]
  await db.put('recipes', row)
  return row
}

export async function deleteRecipe(id: string) {
  recipes.value = recipes.value.filter((r) => r.id !== id)
  await db.del('recipes', id)
}

export async function saveMeal(m: SavedMeal) {
  meals.value = [m, ...meals.value.filter((x) => x.id !== m.id)]
  await db.put('meals', m)
}

export async function deleteMeal(id: string) {
  meals.value = meals.value.filter((m) => m.id !== id)
  await db.del('meals', id)
}

// ---- fasting ----
export const activeFast = computed(() => fasts.value.find((f) => !f.end) ?? null)

export async function startFast(target: number, start = Date.now()) {
  const f: Fast = { id: uid(), start, target }
  fasts.value = [...fasts.value, f]
  await db.put('fasts', f)
}

export async function saveFast(f: Fast) {
  fasts.value = fasts.value.map((x) => (x.id === f.id ? f : x)).sort((a, b) => a.start - b.start)
  await db.put('fasts', f)
}

export async function deleteFast(id: string) {
  fasts.value = fasts.value.filter((f) => f.id !== id)
  await db.del('fasts', id)
}

// ---- profile / goals / settings ----
export async function saveProfile(p: Profile) {
  profile.value = p
  await db.kvSet('profile', p)
}

export async function saveGoals(g: Goals) {
  goals.value = g
  await db.kvSet('goals', g)
}

export async function saveSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch }
  await db.kvSet('settings', settings.value)
}

export function mealName(i: number) {
  return settings.value.meals[i] ?? `Meal ${i + 1}`
}

export { dayKey }
