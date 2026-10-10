// Creates an account with the service role so no confirmation email is needed.
import { createClient } from '@supabase/supabase-js'

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return json(503, { error: 'Accounts are not set up on the server yet.' })

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Bad request.' })
  }
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  const password = String(body.password ?? '')
  if (!EMAIL.test(email) || email.length > 200) return json(400, { error: 'Enter a valid email address.' })
  if (password.length < 8) return json(400, { error: 'Use at least 8 characters for your password.' })
  if (password.length > 72) return json(400, { error: 'Passwords can be at most 72 characters.' })

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) {
    if (/already|exists|registered/i.test(error?.message ?? '')) return json(409, { error: 'An account with this email already exists. Sign in instead.' })
    return json(500, { error: `Could not create the account: ${error?.message ?? 'unknown error'}` })
  }
  return json(200, { ok: true })
}
