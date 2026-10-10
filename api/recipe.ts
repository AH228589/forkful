// Recipe importer: reads the schema.org Recipe data most recipe sites publish.
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } })

const PRIVATE = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|metadata\.google\.internal)|\.(local|internal|localhost)$/i

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°' }

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

type Node = Record<string, unknown>

function isRecipe(n: unknown): n is Node {
  if (!n || typeof n !== 'object') return false
  const t = (n as Node)['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

function findRecipe(n: unknown): Node | null {
  if (Array.isArray(n)) {
    for (const x of n) {
      const r = findRecipe(x)
      if (r) return r
    }
    return null
  }
  if (!n || typeof n !== 'object') return null
  if (isRecipe(n)) return n
  const o = n as Node
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(o[k])
    if (r) return r
  }
  return null
}

function servings(y: unknown): number | undefined {
  const v = Array.isArray(y) ? y[0] : y
  const m = String(v ?? '').match(/\d+/)
  return m ? Math.min(100, +m[0]) : undefined
}

function steps(x: unknown): string[] {
  if (!x) return []
  if (typeof x === 'string') return [decode(x)]
  if (Array.isArray(x)) return x.flatMap(steps)
  const o = x as Node
  if (o.itemListElement) return steps(o.itemListElement)
  if (typeof o.text === 'string') return [decode(o.text)]
  return []
}

export async function GET(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get('url') ?? ''
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return json({ error: 'That does not look like a link' }, 400)
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE.test(target.hostname)) return json({ error: 'That link cannot be imported' }, 400)

  let html = ''
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return json({ error: `The site answered ${res.status}` }, 502)
    html = (await res.text()).slice(0, 4_000_000)
  } catch {
    return json({ error: 'Could not reach that site' }, 504)
  }

  let recipe: Node | null = null
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      recipe = findRecipe(JSON.parse(m[1].trim()))
    } catch {
      /* some sites ship broken JSON-LD */
    }
    if (recipe) break
  }

  let ingredients: string[] = []
  let name = ''
  let yieldN: number | undefined
  let instructions: string[] = []
  if (recipe) {
    const list = (recipe.recipeIngredient ?? recipe.ingredients) as unknown
    ingredients = (Array.isArray(list) ? list : [list]).filter((x) => typeof x === 'string').map((x) => decode(x as string))
    name = decode(String(recipe.name ?? ''))
    yieldN = servings(recipe.recipeYield)
    instructions = steps(recipe.recipeInstructions)
  } else {
    // microdata fallback
    ingredients = [...html.matchAll(/itemprop=["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\/(?:li|span|p|div)>/gi)].map((m) => decode(m[1]))
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    name = t ? decode(t[1]) : ''
  }
  ingredients = ingredients.filter(Boolean).slice(0, 80)
  if (!ingredients.length) return json({ error: 'No ingredient list found on that page' }, 422)
  return json({ name, servings: yieldN, ingredients, instructions: instructions.join('\n\n').slice(0, 8000) }, 200, { 'Cache-Control': 'public, s-maxage=86400' })
}
