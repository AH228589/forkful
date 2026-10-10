// Free-text food parsing used by the recipe importer and voice logging.
import { loadDb, searchLocal } from './foods'
import type { Food, Item } from './types'

const FRACTIONS: Record<string, string> = { '½': ' 1/2', '⅓': ' 1/3', '⅔': ' 2/3', '¼': ' 1/4', '¾': ' 3/4', '⅕': ' 1/5', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8', '⅙': ' 1/6' }

const WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  fifty: 50,
  hundred: 100,
  half: 0.5,
  quarter: 0.25,
  couple: 2,
  few: 3,
  dozen: 12,
  some: 1,
}

type UnitKind = { kind: 'mass'; g: number } | { kind: 'vol'; ml: number; words: string[] } | { kind: 'count'; words: string[] }

const UNITS: [RegExp, UnitKind][] = [
  [/^(mg|milligrams?)$/, { kind: 'mass', g: 0.001 }],
  [/^(g|gr|grams?|grammes?)$/, { kind: 'mass', g: 1 }],
  [/^(kg|kilos?|kilograms?)$/, { kind: 'mass', g: 1000 }],
  [/^(oz|ounces?)$/, { kind: 'mass', g: 28.35 }],
  [/^(lb|lbs|pounds?)$/, { kind: 'mass', g: 453.6 }],
  [/^(ml|milliliters?|millilitres?|mls)$/, { kind: 'vol', ml: 1, words: ['ml', 'fl oz'] }],
  [/^(cl|centiliters?)$/, { kind: 'vol', ml: 10, words: ['fl oz'] }],
  [/^(dl|deciliters?)$/, { kind: 'vol', ml: 100, words: ['cup'] }],
  [/^(l|liters?|litres?)$/, { kind: 'vol', ml: 1000, words: ['cup'] }],
  [/^(tsp|tsps|teaspoons?|t)$/, { kind: 'vol', ml: 4.93, words: ['tsp', 'teaspoon'] }],
  [/^(tbsp|tbsps|tbs|tbl|tablespoons?|T)$/, { kind: 'vol', ml: 14.79, words: ['tbsp', 'tablespoon'] }],
  [/^(cups?|c)$/, { kind: 'vol', ml: 236.6, words: ['cup'] }],
  [/^(pints?|pt)$/, { kind: 'vol', ml: 473, words: ['pint', 'cup'] }],
  [/^(quarts?|qt)$/, { kind: 'vol', ml: 946, words: ['quart', 'cup'] }],
  [/^(glass(es)?|mugs?)$/, { kind: 'vol', ml: 250, words: ['cup', 'fl oz'] }],
  [/^(cloves?)$/, { kind: 'count', words: ['clove'] }],
  [/^(slices?)$/, { kind: 'count', words: ['slice'] }],
  [/^(pieces?|pcs?)$/, { kind: 'count', words: ['piece', 'serving'] }],
  [/^(cans?|tins?)$/, { kind: 'count', words: ['can'] }],
  [/^(sticks?)$/, { kind: 'count', words: ['stick'] }],
  [/^(bars?)$/, { kind: 'count', words: ['bar'] }],
  [/^(scoops?)$/, { kind: 'count', words: ['scoop', 'serving'] }],
  [/^(servings?|portions?)$/, { kind: 'count', words: ['serving'] }],
  [/^(bowls?)$/, { kind: 'count', words: ['bowl', 'cup'] }],
  [/^(plates?)$/, { kind: 'count', words: ['plate', 'serving'] }],
  [/^(bottles?)$/, { kind: 'count', words: ['bottle'] }],
  [/^(handfuls?)$/, { kind: 'count', words: ['handful', 'oz'] }],
  [/^(pinch(es)?|dash(es)?)$/, { kind: 'count', words: ['dash', 'pinch'] }],
  [/^(large|big)$/, { kind: 'count', words: ['large'] }],
  [/^(medium)$/, { kind: 'count', words: ['medium'] }],
  [/^(small)$/, { kind: 'count', words: ['small'] }],
  [/^(heads?)$/, { kind: 'count', words: ['head'] }],
  [/^(bunch(es)?)$/, { kind: 'count', words: ['bunch'] }],
  [/^(sprigs?)$/, { kind: 'count', words: ['sprig'] }],
  [/^(leaves|leaf)$/, { kind: 'count', words: ['leaf', 'leaves'] }],
  [/^(fillets?|filets?)$/, { kind: 'count', words: ['fillet'] }],
  [/^(breasts?)$/, { kind: 'count', words: ['breast'] }],
  [/^(eggs?)$/, { kind: 'count', words: ['large', 'egg'] }],
]

const NOISE =
  /\b(chopped|finely|roughly|coarsely|diced|minced|sliced|thinly|thickly|fresh|freshly|peeled|softened|melted|room temperature|packed|divided|plus more|to taste|optional|for serving|for garnish|garnish|about|approximately|approx|or so|halved|quartered|cubed|grated|shredded|crushed|beaten|lightly|well|trimmed|rinsed|drained|cut into [\w\s-]+|at room temperature|heaping|level|scant|good quality|of)\b/gi

export interface Parsed {
  raw: string
  qty: number
  unit?: UnitKind
  unitWord?: string
  name: string
}

function toNumber(s: string): number {
  s = s.trim().replace(',', '.')
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3]
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) return +frac[1] / +frac[2]
  return parseFloat(s)
}

export function parseLine(line: string): Parsed | null {
  const raw = line.trim()
  let s = raw.replace(/^[-*•·\s]+/, '').replace(/[½⅓⅔¼¾⅕⅛⅜⅝⅞⅙]/g, (c) => FRACTIONS[c])
  s = s.replace(/(\d)\s*-\s*(\d)/g, '$1-$2').trim()
  if (!s) return null
  let qty = NaN
  // numbers like "1 1/2", "2.5", "1/2", ranges "2-3"
  const m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(?:\s*(?:-|to)\s*(\d+(?:[.,]\d+)?))?/)
  if (m) {
    qty = toNumber(m[1])
    if (m[2]) qty = (qty + toNumber(m[2])) / 2
    s = s.slice(m[0].length).trim()
  } else {
    // number words ("two eggs", "half a cup", "a couple of")
    const words = s.toLowerCase().split(/\s+/)
    let i = 0
    let v = 0
    let found = false
    while (i < words.length && words[i] in WORDS) {
      const w = WORDS[words[i]]
      if (words[i] === 'half' && found) v += 0.5
      else if (words[i] === 'dozen' && found) v *= 12
      else if ((words[i] === 'a' || words[i] === 'an') && found) {
        /* "half a" */
      } else v += w
      found = true
      i++
      if (words[i] === 'and' && words[i + 1] && words[i + 1] in WORDS) i++
      if (words[i] === 'of') i++
    }
    if (found) {
      qty = v
      s = words.slice(i).join(' ')
    }
  }
  if (Number.isNaN(qty)) qty = 1
  // attached units like "200g"
  s = s.replace(/^([a-zA-Z]+)\.?\s+/, '$1 ')
  let unit: UnitKind | undefined
  let unitWord: string | undefined
  const two = s.match(/^fl\.?\s?oz\b\.?/i)
  if (two) {
    unit = { kind: 'vol', ml: 29.57, words: ['fl oz'] }
    unitWord = 'fl oz'
    s = s.slice(two[0].length).trim()
  } else {
    const first = s.match(/^([a-zA-Z]+)\.?(\s|$)/)
    if (first) {
      const w = first[1]
      for (const [re, u] of UNITS) {
        if (re.test(w) || re.test(w.toLowerCase())) {
          unit = u
          unitWord = w.toLowerCase()
          if (!/^eggs?$/i.test(w)) s = s.slice(first[0].length).trim()
          break
        }
      }
    }
  }
  s = s.replace(/^of\s+/i, '')
  let name = s
    .replace(/\([^)]*\)/g, ' ')
    .split(/,|;|\bfor\b|\bplus\b|\bto serve\b/)[0]
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) name = s.trim()
  if (!name) return null
  return { raw, qty, unit, unitWord, name }
}

function labelNum(label: string): number {
  const m = label.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?/)
  if (!m) return 1
  return +m[1] + (m[2] ? +m[2] / +m[3] : 0)
}

/** Pick a unit and quantity on the food that best fits the parsed amount. */
export function fitItem(food: Food, p: Parsed): Item {
  const gIdx = food.units.findIndex((u) => u.label === 'g' || u.label === 'ml')
  const u = p.unit
  if (u?.kind === 'mass' && gIdx >= 0) return { food, qty: Math.round(p.qty * u.g * 10) / 10, unit: gIdx }
  if (u?.kind === 'vol' || u?.kind === 'count') {
    for (const w of u.words) {
      const idx = food.units.findIndex((x) => new RegExp(`\\b${w}`, 'i').test(x.label) && !/^(g|ml|oz)$/.test(x.label))
      if (idx >= 0) {
        const per = labelNum(food.units[idx].label)
        let qty = p.qty / per
        if (u.kind === 'vol') {
          // convert between tsp/tbsp/cup when the word differs from the parsed one
          const lab = food.units[idx].label.toLowerCase()
          const labMl = /tsp|teaspoon/.test(lab) ? 4.93 : /tbsp|tablespoon/.test(lab) ? 14.79 : /cup/.test(lab) ? 236.6 : /fl oz/.test(lab) ? 29.57 : u.ml
          qty = (p.qty * u.ml) / (labMl * per)
        }
        return { food, qty: Math.round(qty * 100) / 100, unit: idx }
      }
    }
    if (u.kind === 'vol' && gIdx >= 0) return { food, qty: Math.round(p.qty * u.ml), unit: gIdx }
  }
  // plain count ("a coffee", "2 eggs"): first everyday household portion, skipping tiny measures
  const household = (x: { label: string }) => !/^(g|ml|oz|100 g|100 ml)$/.test(x.label)
  const tiny = /\bfl oz\b|\btbsp\b|\btsp\b|tablespoon|teaspoon|linear inch|cubic inch|\bslice\b|^1 oz\b/i
  let portion = food.units.findIndex((x) => household(x) && !tiny.test(x.label))
  if (portion < 0) portion = food.units.findIndex(household)
  if (portion >= 0) return { food, qty: p.qty / labelNum(food.units[portion].label), unit: portion }
  if (gIdx >= 0) return { food, qty: Math.round(p.qty * 100), unit: gIdx }
  return { food, qty: p.qty, unit: 0 }
}

export interface Match {
  parsed: Parsed
  item: Item | null
  alternatives: Food[]
}

export async function matchLines(lines: string[]): Promise<Match[]> {
  await loadDb()
  const out: Match[] = []
  for (const line of lines) {
    const p = parseLine(line)
    if (!p) continue
    // retry with the trailing words when the full phrase matches nothing ("sunflower or vegetable oil" -> "vegetable oil" -> "oil")
    const words = p.name.replace(/\bor\b/g, ' ').split(/\s+/).filter(Boolean)
    let hits = searchLocal(words.join(' '), 8)
    for (let k = 1; !hits.length && k < words.length; k++) hits = searchLocal(words.slice(k).join(' '), 8)
    const best = hits[0]?.food
    out.push({ parsed: p, item: best ? fitItem(best, p) : null, alternatives: hits.slice(1, 6).map((h) => h.food) })
  }
  return out
}

/** Split a spoken sentence into separate foods. */
export function splitSpoken(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\b(i had|i ate|i've had|i have had|for (breakfast|lunch|dinner|snack)|ate|had)\b/g, ' ')
    .split(/,|\band then\b|\band\b|\bplus\b|\balso\b|\bwith\b|\.|;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}
