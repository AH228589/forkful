// Brand and packaged food search, proxied to Open Food Facts because their search API sends no CORS headers.
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,quantity,nutriments,image_front_small_url'

const KEEP = /^(energy-kcal|energy-kj|energy|proteins|carbohydrates|fat|fiber|sugars|saturated-fat|monounsaturated-fat|polyunsaturated-fat|trans-fat|cholesterol|sodium|salt|potassium|calcium|iron|vitamin-a|vitamin-c|vitamin-d)_100g$/

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } })

export async function GET(req: Request): Promise<Response> {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 120)
  if (q.length < 2) return json({ hits: [] })
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=40&fields=${FIELDS}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Forkful/1.0 (personal food diary; https://github.com/AH228589/forkful)' }, signal: AbortSignal.timeout(9000) })
    if (!res.ok) return json({ error: `upstream ${res.status}`, hits: [] }, 502)
    const data = (await res.json()) as { hits?: Record<string, unknown>[] }
    const hits = (data.hits ?? []).map((h) => {
      const n = (h.nutriments ?? {}) as Record<string, unknown>
      const slim: Record<string, unknown> = {}
      for (const k of Object.keys(n)) if (KEEP.test(k)) slim[k] = n[k]
      return { ...h, nutriments: slim }
    })
    return json({ hits }, 200, { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' })
  } catch (e) {
    return json({ error: (e as Error).message, hits: [] }, 504)
  }
}
