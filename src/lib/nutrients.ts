// Nutrient catalogue. Order matches the keys array in public/foods.json.
export const NUTRIENT_KEYS = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugar',
  'satFat',
  'monoFat',
  'polyFat',
  'transFat',
  'chol',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'vitA',
  'vitC',
  'vitD',
] as const

export type NutrientKey = (typeof NUTRIENT_KEYS)[number]
export type Nutr = Partial<Record<NutrientKey, number>>

export interface NutrientInfo {
  key: NutrientKey
  label: string
  short: string
  unit: 'kcal' | 'g' | 'mg' | 'µg'
  /** FDA daily value for a 2,000 kcal diet. */
  dv?: number
  /** "limit" nutrients are good to stay under, "target" ones good to reach. */
  kind: 'energy' | 'macro' | 'limit' | 'target'
  indent?: boolean
}

export const NUTRIENTS: Record<NutrientKey, NutrientInfo> = {
  kcal: { key: 'kcal', label: 'Calories', short: 'Cal', unit: 'kcal', dv: 2000, kind: 'energy' },
  protein: { key: 'protein', label: 'Protein', short: 'Protein', unit: 'g', dv: 50, kind: 'macro' },
  carbs: { key: 'carbs', label: 'Carbohydrates', short: 'Carbs', unit: 'g', dv: 275, kind: 'macro' },
  fat: { key: 'fat', label: 'Fat', short: 'Fat', unit: 'g', dv: 78, kind: 'macro' },
  fiber: { key: 'fiber', label: 'Fiber', short: 'Fiber', unit: 'g', dv: 28, kind: 'target', indent: true },
  sugar: { key: 'sugar', label: 'Sugar', short: 'Sugar', unit: 'g', dv: 50, kind: 'limit', indent: true },
  satFat: { key: 'satFat', label: 'Saturated fat', short: 'Sat fat', unit: 'g', dv: 20, kind: 'limit', indent: true },
  monoFat: { key: 'monoFat', label: 'Monounsaturated fat', short: 'Mono fat', unit: 'g', kind: 'target', indent: true },
  polyFat: { key: 'polyFat', label: 'Polyunsaturated fat', short: 'Poly fat', unit: 'g', kind: 'target', indent: true },
  transFat: { key: 'transFat', label: 'Trans fat', short: 'Trans fat', unit: 'g', dv: 2, kind: 'limit', indent: true },
  chol: { key: 'chol', label: 'Cholesterol', short: 'Chol', unit: 'mg', dv: 300, kind: 'limit' },
  sodium: { key: 'sodium', label: 'Sodium', short: 'Sodium', unit: 'mg', dv: 2300, kind: 'limit' },
  potassium: { key: 'potassium', label: 'Potassium', short: 'Potassium', unit: 'mg', dv: 4700, kind: 'target' },
  calcium: { key: 'calcium', label: 'Calcium', short: 'Calcium', unit: 'mg', dv: 1300, kind: 'target' },
  iron: { key: 'iron', label: 'Iron', short: 'Iron', unit: 'mg', dv: 18, kind: 'target' },
  vitA: { key: 'vitA', label: 'Vitamin A', short: 'Vit A', unit: 'µg', dv: 900, kind: 'target' },
  vitC: { key: 'vitC', label: 'Vitamin C', short: 'Vit C', unit: 'mg', dv: 90, kind: 'target' },
  vitD: { key: 'vitD', label: 'Vitamin D', short: 'Vit D', unit: 'µg', dv: 20, kind: 'target' },
}

/** Order used on nutrition labels and the nutrients table. */
export const LABEL_ORDER: NutrientKey[] = [
  'kcal',
  'fat',
  'satFat',
  'transFat',
  'polyFat',
  'monoFat',
  'chol',
  'sodium',
  'carbs',
  'fiber',
  'sugar',
  'protein',
  'potassium',
  'vitA',
  'vitC',
  'vitD',
  'calcium',
  'iron',
]

export function add(a: Nutr, b: Nutr, k = 1): Nutr {
  const out: Nutr = { ...a }
  for (const key of NUTRIENT_KEYS) {
    const v = b[key]
    if (v == null || Number.isNaN(v)) continue
    out[key] = (out[key] ?? 0) + v * k
  }
  return out
}

export function scale(n: Nutr, k: number): Nutr {
  const out: Nutr = {}
  for (const key of NUTRIENT_KEYS) {
    const v = n[key]
    if (v != null && !Number.isNaN(v)) out[key] = v * k
  }
  return out
}

export function sum(list: Nutr[]): Nutr {
  let t: Nutr = {}
  for (const n of list) t = add(t, n)
  return t
}

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

/** Share of calories from each macro, from grams. */
export function macroSplit(n: Nutr) {
  const p = (n.protein ?? 0) * 4
  const c = (n.carbs ?? 0) * 4
  const f = (n.fat ?? 0) * 9
  const t = p + c + f
  if (!t) return { carbs: 0, fat: 0, protein: 0 }
  return { carbs: c / t, fat: f / t, protein: p / t }
}

export function fmtN(v: number | undefined, key: NutrientKey | 'raw' = 'raw'): string {
  if (v == null || Number.isNaN(v)) return '-'
  if (key === 'kcal') return Math.round(v).toLocaleString()
  const a = Math.abs(v)
  if (a >= 100) return Math.round(v).toLocaleString()
  if (a >= 10) return (Math.round(v * 10) / 10).toString()
  if (a === 0) return '0'
  return (Math.round(v * 10) / 10 || Math.round(v * 100) / 100).toString()
}

/** FDA-style quick read: 5% DV or less is low, 20% DV or more is high. */
export function insights(n: Nutr): { text: string; tone: 'good' | 'warn' }[] {
  const out: { text: string; tone: 'good' | 'warn' }[] = []
  const pct = (k: NutrientKey) => (n[k] ?? 0) / (NUTRIENTS[k].dv ?? Infinity)
  const kcal = n.kcal ?? 0
  if ((n.protein ?? 0) * 4 >= kcal * 0.3 && (n.protein ?? 0) >= 10) out.push({ text: 'High in protein', tone: 'good' })
  if (pct('fiber') >= 0.2) out.push({ text: 'High in fiber', tone: 'good' })
  for (const k of ['vitC', 'calcium', 'iron', 'potassium', 'vitA', 'vitD'] as NutrientKey[]) {
    if (pct(k) >= 0.2) out.push({ text: `High in ${NUTRIENTS[k].label.toLowerCase().replace('vitamin', 'vitamin')}`, tone: 'good' })
  }
  if (pct('sodium') >= 0.2) out.push({ text: 'High in sodium', tone: 'warn' })
  if (pct('satFat') >= 0.2) out.push({ text: 'High in saturated fat', tone: 'warn' })
  if ((n.sugar ?? 0) >= 15) out.push({ text: 'High in sugar', tone: 'warn' })
  if ((n.transFat ?? 0) >= 0.5) out.push({ text: 'Contains trans fat', tone: 'warn' })
  if (kcal > 0 && pct('sodium') <= 0.05 && n.sodium != null) out.push({ text: 'Low sodium', tone: 'good' })
  if (kcal > 40 && (n.carbs ?? 0) * 4 <= kcal * 0.1) out.push({ text: 'Low carb', tone: 'good' })
  return out.slice(0, 5)
}
