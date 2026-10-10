// Deletes the signed-in account: its progress photos, then the user (records cascade).
import { createClient } from '@supabase/supabase-js'

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status })

export async function DELETE(req: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return json(503, { error: 'Accounts are not set up on the server yet.' })
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Not signed in.' })

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return json(401, { error: 'Your session expired. Sign in again.' })
  const uid = data.user.id

  for (;;) {
    const { data: files } = await admin.storage.from('photos').list(uid, { limit: 1000 })
    if (!files?.length) break
    await admin.storage.from('photos').remove(files.map((f) => `${uid}/${f.name}`))
    if (files.length < 1000) break
  }
  const del = await admin.auth.admin.deleteUser(uid)
  if (del.error) return json(500, { error: del.error.message })
  return json(200, { ok: true })
}
