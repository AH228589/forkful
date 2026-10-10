import { signal } from '@preact/signals'
import * as db from './db'
import { NUTRIENT_KEYS, scale, type Nutr, type NutrientKey } from './nutrients'
import { foods, history, meals, recipes } from './store'
import type { Food, Item, Recipe, Unit } from './types'

// ---------- units & servings ----------
const OZ = 28.3495

export function massUnits(gramsPerBase: number, liquid = false): Unit[] {
  const g = liquid ? 'ml' : 'g'
  return [
    { label: g, g: 1, f: 1 / gramsPerBase },
    { label: 'oz', g: OZ, f: OZ / gramsPerBase },
    { label: `100 ${g}`, g: 100, f: 100 / gramsPerBase },
  ]
}

export function itemNutr(it: Item): Nutr {
  const u = it.food.units[it.unit] ?? it.food.units[0]
  return scale(it.food.n, it.qty * (u?.f ?? 1))
}

export function itemGrams(it: Item): number | undefined {
  const u = it.food.units[it.unit] ?? it.food.units[0]
  return u?.g != null ? u.g * it.qty : undefined
}

const trimNum = (v: number) => String(Math.round(v * 100) / 100)

export function fmtServing(qty: number, u: Unit | undefined): string {
  if (!u) return trimNum(qty)
  const q = trimNum(qty)
  if (/^(g|ml|oz)$/.test(u.label)) return `${q} ${u.label}`
  const m = u.label.match(/^1(\s+|$)(.*)$/)
  if (m) return `${q} ${m[2] || 'serving'}`.trim()
  return qty === 1 ? u.label : `${q} × ${u.label}`
}

export function unitLabel(u: Unit): string {
  if (/^(g|ml|oz)$/.test(u.label)) return u.label
  if (u.g != null && !/\d\s*(g|ml)\)?$/.test(u.label)) return `${u.label} (${trimNum(u.g)} ${'g'})`
  return u.label
}

// ---------- the bundled generic database ----------
type Row = [number, string, (number | null)[], [string, number][]?, string?]
interface Db {
  keys: string[]
  rows: Row[]
  norm: string[][]
  seg: number[]
  src: string
}

export const dbState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle')
let dbData: Db | null = null
let dbPromise: Promise<Db | null> | null = null

export function loadDb(): Promise<Db | null> {
  if (dbPromise) return dbPromise
  dbState.value = 'loading'
  dbPromise = fetch('/foods.json')
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    })
    .then((j: { keys: string[]; foods: Row[]; src: string }) => {
      dbData = { keys: j.keys, rows: j.foods, norm: j.foods.map((f) => tokens(f[1])), seg: j.foods.map((f) => tokens(f[1].split(',')[0]).length), src: j.src }
      dbState.value = 'ready'
      return dbData
    })
    .catch(() => {
      dbState.value = 'error'
      dbPromise = null
      return null
    })
  return dbPromise
}

function rowToFood(r: Row, keys: string[]): Food {
  const n: Nutr = {}
  r[2].forEach((v, i) => {
    if (v != null) n[keys[i] as NutrientKey] = v
  })
  const portions: Unit[] = (r[3] ?? []).map(([label, g]) => ({ label: /^\d/.test(label) ? label : `1 ${label}`, g, f: g / 100 }))
  return { id: `g:${r[0]}`, name: r[1], source: 'usda', n, units: [...portions, ...massUnits(100)], cat: r[4] }
}

export function dbFood(id: string): Food | null {
  if (!dbData) return null
  const num = Number(id.replace(/^g:/, ''))
  const r = dbData.rows.find((x) => x[0] === num)
  return r ? rowToFood(r, dbData.keys) : null
}

// ---------- search ----------
const stem = (t: string) => (t.length > 4 && t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.length > 3 && t.endsWith('es') && /(ches|shes|oes|sses|xes)$/.test(t) ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t)

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(stem)
}

/** Higher is better; -Infinity when a query word is missing. `seg` is how many name words sit before the first comma. */
function matchScore(q: string[], name: string[], seg = name.length): number {
  if (!q.length) return 0
  let score = 0
  let inSeg = 0
  for (let i = 0; i < q.length; i++) {
    const t = q[i]
    let best = -1
    for (let j = 0; j < name.length; j++) {
      const w = name[j]
      if (w === t) {
        best = j
        break
      }
      if (best < 0 && w.startsWith(t)) best = j
    }
    if (best < 0) return -Infinity
    score += name[best] === t ? 10 : 6
    if (best === i) score += 4
    if (best === 0) score += i === 0 ? 14 : 2
    if (best < seg) inSeg++
  }
  // the words before the first comma name the food itself ("Wheat flour, white" vs "Pretzels, made with flour")
  score += inSeg * 6 + (inSeg === q.length ? 6 : 0)
  score -= name.length * 1.6
  return score
}

// Everyday picks that should win ties for short queries like "egg" or "milk".
const CANON = new Set([
  'Egg, whole, raw',
  'Coffee, brewed',
  'Bread, white',
  'Bread, whole wheat',
  'Milk, whole',
  'Milk, NFS',
  'Rice, white, cooked, no added fat',
  'Rice, brown, cooked, no added fat',
  'Chicken breast, baked, broiled, or roasted, skin not eaten, from raw',
  'Banana, raw',
  'Apple, raw',
  'Orange, raw',
  'Strawberries, raw',
  'Blueberries, raw',
  'Grapes, raw',
  'Avocado, raw',
  'Tomatoes, raw',
  'Cucumber, raw',
  'Butter, NFS',
  'Olive oil',
  'Vegetable oil, NFS',
  'Cheese, Cheddar',
  'Yogurt, NFS',
  'Peanut butter',
  'Sugar, white, granulated or lump',
  'Honey',
  'Wheat flour, white, all-purpose, enriched, bleached',
  'Onions, raw',
  'Garlic, raw',
  'Water, tap',
  'Beer',
  'Wine, red',
  'Orange juice, 100%, NFS',
  'Tea, hot, leaf, black',
  'Potato, baked, peel eaten',
  'Oatmeal, regular or quick, made with water, no added fat',
])

// British and other regional words mapped to the USDA wording.
const SYNONYMS: [RegExp, string][] = [
  [/\bplain flour\b/g, 'all-purpose flour'],
  [/\bself[- ]raising flour\b/g, 'self-rising flour'],
  [/\bcaster sugar\b/g, 'granulated sugar'],
  [/\bicing sugar\b/g, 'powdered sugar'],
  [/\baubergines?\b/g, 'eggplant'],
  [/\bcourgettes?\b/g, 'zucchini'],
  [/\bcoriander leaves\b/g, 'cilantro'],
  [/\b(minced beef|beef mince|mince)\b/g, 'ground beef'],
  [/\bspring onions?\b/g, 'green onion'],
  [/\bscallions?\b/g, 'green onion'],
  [/\bdouble cream\b/g, 'heavy cream'],
  [/\bsingle cream\b/g, 'light cream'],
  [/\bprawns?\b/g, 'shrimp'],
  [/\brocket\b/g, 'arugula'],
  [/\bbicarbonate of soda\b/g, 'baking soda'],
  [/\bporridge\b/g, 'oatmeal'],
  [/\bcapsicums?\b/g, 'peppers'],
  [/\bgarbanzo beans?\b/g, 'chickpeas'],
  [/\bjacket potato\b/g, 'potato baked'],
  [/\bcrisps\b/g, 'potato chips'],
  [/\btoast\b/g, 'bread toasted'],
  [/\bbeetroot\b/g, 'beets'],
]

export function normalizeQuery(q: string): string {
  let s = q.toLowerCase()
  for (const [re, rep] of SYNONYMS) s = s.replace(re, rep)
  return s
}

const RAW_HINT = /\b(raw|fresh|plain|whole|cooked|boiled|regular)\b/

export interface Hit {
  food: Food
  score: number
  kind: 'mine' | 'recipe' | 'history' | 'db'
}

export function searchLocal(query: string, limit = 60): Hit[] {
  const q = tokens(normalizeQuery(query))
  const baby = q.some((t) => /^(baby|infant|toddler)/.test(t))
  if (!q.length) return []
  const hits: Hit[] = []
  const seen = new Set<string>()
  const hist = new Map(history.value.map((h) => [h.food.id, h]))

  for (const f of foods.value) {
    const s = matchScore(q, tokens(`${f.name} ${f.brand ?? ''}`))
    if (s > -Infinity) {
      hits.push({ food: f, score: s + 60, kind: 'mine' })
      seen.add(f.id)
    }
  }
  for (const r of recipes.value) {
    const s = matchScore(q, tokens(r.name))
    if (s > -Infinity) {
      const f = recipeFood(r)
      hits.push({ food: f, score: s + 55, kind: 'recipe' })
      seen.add(f.id)
    }
  }
  for (const h of hist.values()) {
    if (seen.has(h.food.id)) continue
    const s = matchScore(q, tokens(`${h.food.name} ${h.food.brand ?? ''}`))
    if (s > -Infinity) {
      hits.push({ food: h.food, score: s + 40 + Math.min(h.count, 20), kind: 'history' })
      seen.add(h.food.id)
    }
  }
  if (dbData) {
    const { rows, norm, seg, keys } = dbData
    const scored: [number, number][] = []
    for (let i = 0; i < rows.length; i++) {
      let s = matchScore(q, norm[i], seg[i])
      if (s === -Infinity) continue
      const name = rows[i][1]
      if (rows[i][0] >= 2000000) s += 2 // FNDDS "as eaten" foods read more naturally
      if (RAW_HINT.test(name.toLowerCase())) s += 1.5
      if (CANON.has(name)) s += 9
      if (/\bNFS\b/.test(name)) s += 2
      if (!baby && /^(Babyfood|Baby Toddler|Infant formula|Toddler formula)/i.test(name)) s -= 25
      scored.push([s, i])
    }
    scored.sort((a, b) => b[0] - a[0])
    for (const [s, i] of scored.slice(0, limit)) {
      const id = `g:${rows[i][0]}`
      if (seen.has(id)) continue
      hits.push({ food: rowToFood(rows[i], keys), score: s, kind: 'db' })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

// ---------- recipes & meals as foods ----------
export function recipeTotals(r: Pick<Recipe, 'items'>): Nutr {
  let t: Nutr = {}
  for (const it of r.items) {
    const n = itemNutr(it)
    for (const k of NUTRIENT_KEYS) if (n[k] != null) t[k] = (t[k] ?? 0) + (n[k] as number)
  }
  return t
}

export function recipeFood(r: Recipe): Food {
  const total = recipeTotals(r)
  const grams = r.items.reduce((s, it) => s + (itemGrams(it) ?? 0), 0)
  const per = Math.max(1, r.servings)
  const units: Unit[] = [{ label: '1 serving', f: 1, g: grams ? grams / per : undefined }]
  if (grams > 0) units.push(...massUnits(grams / per))
  return { id: `r:${r.id}`, name: r.name, source: 'recipe', n: scale(total, 1 / per), units }
}

export function mealTotals(id: string): Nutr {
  const m = meals.value.find((x) => x.id === id)
  return m ? recipeTotals(m) : {}
}

// ---------- Open Food Facts ----------
type OffProduct = {
  code?: string
  product_name?: string
  product_name_en?: string
  generic_name?: string
  brands?: string | string[]
  serving_size?: string
  serving_quantity?: number | string
  quantity?: string
  nutriments?: Record<string, number | string>
  image_front_small_url?: string
  categories_tags?: string[]
}

const num = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

export function offToFood(p: OffProduct): Food | null {
  const nm = p.nutriments ?? {}
  const g = (k: string, mult = 1) => {
    const v = num(nm[`${k}_100g`])
    return v == null ? undefined : v * mult
  }
  let kcal = g('energy-kcal')
  if (kcal == null) {
    const kj = g('energy-kj') ?? g('energy')
    if (kj != null) kcal = kj / 4.184
  }
  const protein = g('proteins')
  const carbs = g('carbohydrates')
  const fat = g('fat')
  if (kcal == null && protein == null && carbs == null && fat == null) return null
  if (kcal == null) kcal = (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9
  let sodium = g('sodium', 1000)
  if (sodium == null) {
    const salt = g('salt')
    if (salt != null) sodium = salt * 400
  }
  const n: Nutr = {
    kcal,
    protein,
    carbs,
    fat,
    fiber: g('fiber'),
    sugar: g('sugars'),
    satFat: g('saturated-fat'),
    monoFat: g('monounsaturated-fat'),
    polyFat: g('polyunsaturated-fat'),
    transFat: g('trans-fat'),
    chol: g('cholesterol', 1000),
    sodium,
    potassium: g('potassium', 1000),
    calcium: g('calcium', 1000),
    iron: g('iron', 1000),
    vitA: g('vitamin-a', 1e6),
    vitC: g('vitamin-c', 1000),
    vitD: g('vitamin-d', 1e6),
  }
  for (const k of NUTRIENT_KEYS) if (n[k] == null) delete n[k]
  const liquid = /\b\d*\s*(ml|cl|l|fl\.? ?oz)\b/i.test(`${p.serving_size ?? ''} ${p.quantity ?? ''}`) && !/\d\s*g\b/i.test(p.serving_size ?? '')
  const units: Unit[] = []
  const sq = num(p.serving_quantity)
  if (sq && sq > 0) units.push({ label: `1 serving (${(p.serving_size || `${sq} ${liquid ? 'ml' : 'g'}`).trim()})`, g: sq, f: sq / 100 })
  units.push(...massUnits(100, liquid))
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0]
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim()
  if (!name) return null
  return { id: `o:${p.code}`, name, brand: brand?.trim() || undefined, source: 'off', n, units, barcode: p.code, img: p.image_front_small_url }
}

const OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,quantity,nutriments,image_front_small_url'

export async function lookupBarcode(code: string): Promise<Food | null> {
  const clean = code.replace(/\D/g, '')
  // 1. your own foods and history
  const mine = foods.value.find((f) => f.barcode && f.barcode.replace(/^0+/, '') === clean.replace(/^0+/, ''))
  if (mine) return mine
  const used = history.value.find((h) => h.food.barcode && h.food.barcode.replace(/^0+/, '') === clean.replace(/^0+/, ''))
  if (used) return used.food
  // 2. cached lookups
  const cached = await db.get<{ id: string; food: Food | null; at: number }>('cache', `bc:${clean}`)
  if (cached?.food) return cached.food
  // 3. Open Food Facts
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${OFF_FIELDS}`)
  if (!res.ok && res.status !== 404) throw new Error('lookup failed')
  const j = await res.json()
  const food = j?.product ? offToFood({ ...j.product, code: j.product.code || clean }) : null
  if (food) await db.put('cache', { id: `bc:${clean}`, food, at: Date.now() })
  return food
}

export async function searchOnline(q: string, signal?: AbortSignal): Promise<Food[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) throw new Error(`search ${res.status}`)
  const j = (await res.json()) as { hits?: OffProduct[] }
  const out: Food[] = []
  const seen = new Set<string>()
  for (const p of j.hits ?? []) {
    const f = offToFood(p)
    if (!f) continue
    const key = `${f.name}|${f.brand}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

/** Default serving for a food: its own first unit. */
export function defaultItem(food: Food): Item {
  const h = history.value.find((x) => x.food.id === food.id)
  if (h && h.unit < food.units.length) return { food, qty: h.qty, unit: h.unit }
  // foods with no household serving start at 100 g rather than 1 g
  if (/^(g|ml)$/.test(food.units[0]?.label ?? '')) return { food, qty: 100, unit: 0 }
  return { food, qty: 1, unit: 0 }
}

export function dbSource(): string {
  return dbData?.src ?? 'USDA FoodData Central'
}
