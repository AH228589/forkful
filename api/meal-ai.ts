// AI meal logging: estimates foods and nutrition from a meal photo, a delivery order screenshot,
// and/or a text description. Signed-in accounts only, with a daily cap per account.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const DAILY_LIMIT = 60
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5'

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status })

const Item = z.object({
  name: z.string().describe('Short diary name, e.g. "Chicken doner wrap" or "French fries"'),
  restaurant: z.string().describe('Restaurant or brand if known from the order or packaging, else empty string'),
  portion: z.string().describe('Human portion description, e.g. "1 large wrap", "1 medium portion", "330 ml can"'),
  grams: z.number().describe('Estimated weight in grams (ml for drinks) of the whole portion eaten'),
  kcal: z.number(),
  protein: z.number().describe('grams'),
  carbs: z.number().describe('grams'),
  fat: z.number().describe('grams'),
  fiber: z.number().describe('grams'),
  sugar: z.number().describe('grams'),
  satFat: z.number().describe('grams of saturated fat'),
  sodium: z.number().describe('milligrams'),
  confidence: z.enum(['low', 'medium', 'high']),
})

const Result = z.object({
  items: z.array(Item),
  notes: z.string().describe('One or two short sentences: assumptions made, or why nothing was found'),
})

const SYSTEM = `You estimate nutrition for a personal food diary app.

The user sends any mix of: a photo of a meal, a screenshot of a food delivery order, receipt or menu (apps like Glovo, Wolt, Foodpanda, Uber Eats, Takeaway), and a short text description. Work out everything they ate or are about to eat and list each distinct food or drink as its own item.

How to estimate:
- Order screenshots: read every ordered line, including quantities (2x means two portions, list it as one item with the combined portion), sides, sauces, dips and drinks. Use the restaurant name when visible. Ignore delivery fees, tips and prices.
- Photos: judge portion size from the plate, cutlery, packaging and hands. Include visible sauces, dressings, cooking oil and drinks.
- Text: follow the description literally, including any portion hints ("half", "large", "shared with a friend" means half).
- Known chains (McDonald's, KFC, Burger King, Subway, Domino's, Starbucks and similar): use their published nutrition when you know it.
- Restaurant and takeaway food is usually larger and richer than home cooking; estimate typical restaurant portions and fat use, not lean home versions.
- Use realistic numbers. Calories must roughly match 4 x protein + 4 x carbs + 9 x fat.
- Names should be short and in English. Put the restaurant or brand in its own field.
- confidence: high for packaged or chain items with known data, medium for clear photos or detailed orders, low when guessing.
- If the input shows no food at all, return an empty items list and say so in notes.`

export async function POST(req: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'AI meal logging is not switched on yet: the server has no Claude API key.' })
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
  const mediaType = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const).find((t) => t === body.mediaType) ?? 'image/jpeg'
  if (!image && !text) return json(400, { error: 'Add a photo, a screenshot or a description.' })
  if (image.length > 6_000_000) return json(413, { error: 'That image is too large.' })

  const { data: used, error: limitError } = await admin.rpc('ai_bump', { uid: who.user.id })
  if (limitError) return json(500, { error: 'Could not check your daily limit.' })
  if ((used as number) > DAILY_LIMIT) return json(429, { error: `You've used today's ${DAILY_LIMIT} AI scans. They reset tomorrow.` })

  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: image } })
  content.push({ type: 'text', text: text ? `What I ate: ${text}` : 'Estimate what is in this image.' })

  const client = new Anthropic()
  const withFallback = /^claude-(opus|fable|sonnet-5-5)/.test(MODEL)
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(Result) },
      ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })
    if (response.stop_reason === 'refusal') return json(422, { error: 'The AI could not analyse this one. Try a different photo or describe the meal in words.' })
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) return json(502, { error: 'The AI answer was incomplete. Try again.' })
    return json(200, { ...response.parsed_output, used, limit: DAILY_LIMIT })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(503, { error: 'The Claude API key on the server is not valid.' })
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'The AI is busy right now. Try again in a minute.' })
    if (e instanceof Anthropic.BadRequestError) return json(400, { error: `The AI could not read that input: ${e.message}` })
    if (e instanceof Anthropic.APIError) return json(502, { error: `AI service error (${e.status}). Try again.` })
    return json(500, { error: 'Something went wrong talking to the AI.' })
  }
}
