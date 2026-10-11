// AI meal logging: estimates foods and nutrition from a meal photo, a delivery order screenshot,
// and/or a text description, using Google's Gemini API (free tier). Signed-in accounts only,
// with a daily cap per account.
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const DAILY_LIMIT = 60
// Tried in order: when the free tier is busy or rate limited on one model, the next one answers.
const MODELS = (process.env.AI_MODELS || 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite').split(',').map((m) => m.trim())

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status })

const Item = z.object({
  name: z.string(),
  restaurant: z.string(),
  portion: z.string(),
  grams: z.number(),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
  sugar: z.number(),
  satFat: z.number(),
  sodium: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
})
const Result = z.object({ items: z.array(Item), notes: z.string() })

const num = (description: string) => ({ type: 'number', description })
const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short diary name in English, e.g. "Chicken doner wrap" or "French fries"' },
          restaurant: { type: 'string', description: 'Restaurant or brand if known from the order or packaging, else empty string' },
          portion: { type: 'string', description: 'Portion description starting with a number, e.g. "1 large wrap", "1 medium portion", "1 can (330 ml)"' },
          grams: num('Estimated weight in grams (ml for drinks) of the whole portion eaten'),
          kcal: num('Calories for the whole portion'),
          protein: num('grams'),
          carbs: num('grams'),
          fat: num('grams'),
          fiber: num('grams'),
          sugar: num('grams'),
          satFat: num('grams of saturated fat'),
          sodium: num('milligrams'),
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['name', 'restaurant', 'portion', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodium', 'confidence'],
      },
    },
    notes: { type: 'string', description: 'One or two short sentences: assumptions made, or why nothing was found' },
  },
  required: ['items', 'notes'],
}

const SYSTEM = `You estimate nutrition for a personal food diary app.

The user sends any mix of: a photo of a meal, a screenshot of a food delivery order, receipt or menu (apps like Glovo, Wolt, Foodpanda, Uber Eats, Takeaway), and a short text description. Work out everything they ate or are about to eat and list each distinct food or drink as its own item.

How to estimate:
- Order screenshots: read every ordered line, including quantities (2x means two portions, list it as one item with the combined portion), sides, sauces, dips and drinks. Use the restaurant name when visible. Ignore delivery fees, tips, prices, names and addresses.
- Photos: judge portion size from the plate, cutlery, packaging and hands. Include visible sauces, dressings, cooking oil and drinks.
- Text: follow the description literally, including any portion hints ("half", "large", "shared with a friend" means half).
- Known chains (McDonald's, KFC, Burger King, Subway, Domino's, Starbucks and similar): use their published nutrition when you know it.
- Restaurant and takeaway food is usually larger and richer than home cooking; estimate typical restaurant portions and fat use, not lean home versions.
- Use realistic numbers. Calories must roughly match 4 x protein + 4 x carbs + 9 x fat.
- confidence: high for packaged or chain items with known data, medium for clear photos or detailed orders, low when guessing.
- If the input shows no food at all, return an empty items list and say so in notes.`

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { code?: number; message?: string; status?: string }
}

async function ask(model: string, key: string, image: string, mediaType: string, text: string): Promise<{ status: number; body: GeminiResponse }> {
  const parts: Record<string, unknown>[] = []
  if (image) parts.push({ inline_data: { mime_type: mediaType, data: image } })
  parts.push({ text: text ? `What I ate: ${text}` : 'Estimate what is in this image.' })
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, thinkingConfig: { thinkingLevel: 'LOW' } },
    }),
    // a stalled model hands over to the next one instead of making you wait a minute
    signal: AbortSignal.timeout(25000),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as GeminiResponse }
}

export async function POST(req: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  const gemini = process.env.GEMINI_API_KEY
  if (!gemini) return json(503, { error: 'AI meal logging is not switched on yet: the server has no Gemini API key.' })
  if (!url || !key) return json(503, { error: 'Accounts are not set up on the server yet.' })

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Sign in to use AI meal logging.' })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: who, error: authError } = await admin.auth.getUser(token)
  if (authError || !who.user) return json(401, { error: 'Your session expired. Sign in again.' })

  let body: { image?: string; mediaType?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Bad request.' })
  }
  const text = String(body.text ?? '').trim().slice(0, 2000)
  const image = typeof body.image === 'string' ? body.image.replace(/^data:[^,]+,/, '') : ''
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].find((t) => t === body.mediaType) ?? 'image/jpeg'
  if (!image && !text) return json(400, { error: 'Add a photo, a screenshot or a description.' })
  if (image.length > 6_000_000) return json(413, { error: 'That image is too large.' })

  const { data: used, error: limitError } = await admin.rpc('ai_bump', { uid: who.user.id })
  if (limitError) return json(500, { error: 'Could not check your daily limit.' })
  if ((used as number) > DAILY_LIMIT) return json(429, { error: `You've used today's ${DAILY_LIMIT} AI scans. They reset tomorrow.` })

  let last = ''
  // what each model attempt did, returned for troubleshooting slow or failed scans
  const tries: { model: string; status: number | string; ms: number }[] = []
  for (const model of MODELS) {
    let r: { status: number; body: GeminiResponse }
    const t0 = Date.now()
    try {
      r = await ask(model, gemini, image, mediaType, text)
      tries.push({ model, status: r.status, ms: Date.now() - t0 })
    } catch {
      tries.push({ model, status: 'timeout', ms: Date.now() - t0 })
      last = 'The AI took too long to answer.'
      continue
    }
    // busy, rate limited or a model this key can't use: try the next model
    if (r.status === 429 || r.status >= 500 || r.status === 404) {
      last = r.status === 429 ? 'The free AI is busy right now. Try again in a minute.' : `AI service error (${r.status}).`
      continue
    }
    if (r.status === 400 && /api key/i.test(r.body.error?.message ?? '')) return json(503, { error: 'The Gemini API key on the server is not valid.' })
    if (r.status !== 200) return json(502, { error: `The AI could not read that input (${r.body.error?.message ?? r.status}).` })
    if (r.body.promptFeedback?.blockReason) return json(422, { error: 'The AI would not analyse this one. Try a different photo or describe the meal in words.' })
    const cand = r.body.candidates?.[0]
    const raw = (cand?.content?.parts ?? [])
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join('')
    let parsed: z.infer<typeof Result> | null = null
    try {
      const check = Result.safeParse(JSON.parse(raw))
      if (check.success) parsed = check.data
    } catch {
      /* not JSON */
    }
    if (!parsed) {
      last = cand?.finishReason && cand.finishReason !== 'STOP' ? `The AI stopped early (${cand.finishReason}).` : 'The AI answer was incomplete.'
      continue
    }
    return json(200, { ...parsed, used, limit: DAILY_LIMIT, model, tries })
  }
  return json(502, { error: `${last || 'The AI is unavailable right now.'} Try again.`, tries })
}
