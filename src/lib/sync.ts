// Cloud sync: IndexedDB stays the source of truth on the phone; every local change is queued in the
// outbox and pushed to Supabase, and changes from other devices are pulled by server timestamp.
import { createClient } from '@supabase/supabase-js'
import { account, syncState } from './account'
import * as db from './db'
import { loadAll } from './store'

const env = import.meta.env
const url: string | undefined = env.NEXT_PUBLIC_SUPABASE_URL
const anon: string | undefined = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supa = url && anon ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'forkful-auth', detectSessionInUrl: false } }) : null

type OutRow = { key: string; store: db.StoreName; id: string; v: number }
type Remote = { store: db.StoreName; id: string; data: Record<string, unknown> | null; deleted: boolean; updated_at: string }

const EPOCH = '1970-01-01T00:00:00.000Z'
const PAGE = 1000

// ---------- per-account sync bookkeeping (device local) ----------
function meta(uid: string): { cursor: string; linked: boolean } {
  try {
    return { cursor: EPOCH, linked: false, ...JSON.parse(localStorage.getItem(`forkful-sync:${uid}`) || '{}') }
  } catch {
    return { cursor: EPOCH, linked: false }
  }
}
function saveMeta(uid: string, m: { cursor: string; linked: boolean }) {
  try {
    localStorage.setItem(`forkful-sync:${uid}`, JSON.stringify(m))
  } catch {
    /* storage blocked */
  }
}

// ---------- outbox ----------
let ver = Date.now()
async function enqueue(store: db.StoreName, ids: string[]) {
  const rows: OutRow[] = ids.map((id) => ({ key: `${store}|${id}`, store, id, v: ++ver }))
  await db.raw.putMany('outbox', rows)
  syncState.value = { ...syncState.value, pending: syncState.value.pending + rows.length }
  schedule()
}

function track(on: boolean) {
  db.onLocalWrite(on ? (store, keys) => void enqueue(store, keys) : null)
}

// ---------- scheduling ----------
let timer = 0
let running: Promise<void> | null = null
let again = false

export function schedule(ms = 1500) {
  clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), ms)
}

export async function syncNow(): Promise<boolean> {
  const uid = account.value.id
  if (!supa || !uid) return false
  if (!navigator.onLine) {
    syncState.value = { ...syncState.value, status: 'offline' }
    return false
  }
  if (running) {
    again = true
    await running
    return syncState.value.status !== 'error'
  }
  running = (async () => {
    syncState.value = { ...syncState.value, status: 'syncing', error: undefined }
    try {
      do {
        again = false
        let changed = 0
        const m = meta(uid)
        if (!m.linked) changed += await link(uid)
        await push(uid)
        changed += await pull(uid)
        if (changed) await loadAll()
      } while (again)
      const pending = (await db.getAllKeys('outbox')).length
      syncState.value = { status: 'idle', last: Date.now(), pending }
    } catch (e) {
      syncState.value = { ...syncState.value, status: navigator.onLine ? 'error' : 'offline', error: (e as Error).message }
    }
  })()
  try {
    await running
  } finally {
    running = null
  }
  return syncState.value.status === 'idle'
}

// ---------- push ----------
const stripBlob = (v: Record<string, unknown>) => {
  const { blob: _b, ...rest } = v
  return rest
}

async function push(uid: string) {
  const box = await db.getAll<OutRow>('outbox')
  for (let i = 0; i < box.length; i += 200) {
    const chunk = box.slice(i, i + 200)
    const rows: { user_id: string; store: string; id: string; data: unknown; deleted: boolean }[] = []
    for (const o of chunk) {
      const v = await db.get<Record<string, unknown>>(o.store, o.id)
      if (o.store === 'photos') {
        const path = `${uid}/${o.id}.jpg`
        if (v?.blob instanceof Blob) {
          const { error } = await supa!.storage.from('photos').upload(path, v.blob, { upsert: true, contentType: v.blob.type || 'image/jpeg' })
          if (error) throw new Error(`Photo upload failed: ${error.message}`)
        } else if (!v) await supa!.storage.from('photos').remove([path])
      }
      rows.push({ user_id: uid, store: o.store, id: o.id, data: v ? (o.store === 'photos' ? stripBlob(v) : v) : null, deleted: !v })
    }
    const { error } = await supa!.from('records').upsert(rows, { onConflict: 'user_id,store,id' })
    if (error) throw new Error(error.message)
    // only clear entries that were not changed again while we were uploading
    const done: string[] = []
    for (const o of chunk) {
      const cur = await db.get<OutRow>('outbox', o.key)
      if (cur && cur.v === o.v) done.push(o.key)
    }
    await db.raw.delMany('outbox', done)
    syncState.value = { ...syncState.value, pending: Math.max(0, syncState.value.pending - done.length) }
  }
}

// ---------- pull ----------
async function pull(uid: string, seen?: Map<db.StoreName, Set<string>>): Promise<number> {
  const m = meta(uid)
  // re-read a minute of overlap so rows committed slightly out of order are never skipped
  const since = new Date(Math.max(0, new Date(m.cursor).getTime() - 60000)).toISOString()
  let cursor = m.cursor
  let changed = 0
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa!.from('records').select('store,id,data,deleted,updated_at').gt('updated_at', since).order('updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Remote[]
    const pending = new Set(await db.getAllKeys('outbox'))
    const puts = new Map<db.StoreName, unknown[]>()
    const dels = new Map<db.StoreName, string[]>()
    for (const r of rows) {
      if (!db.SYNCED.includes(r.store)) continue
      seen?.get(r.store)?.add(r.id) ?? seen?.set(r.store, new Set([r.id]))
      if (r.updated_at > cursor) cursor = r.updated_at
      if (pending.has(`${r.store}|${r.id}`)) continue // a newer local edit is waiting to upload
      if (r.deleted || !r.data) {
        dels.set(r.store, [...(dels.get(r.store) ?? []), r.id])
        continue
      }
      let value: unknown = r.data
      if (r.store === 'photos') {
        const local = await db.get<Record<string, unknown>>('photos', r.id)
        let blob = local?.blob as Blob | undefined
        if (!blob) {
          const dl = await supa!.storage.from('photos').download(`${uid}/${r.id}.jpg`)
          if (dl.error) continue
          blob = dl.data
        }
        value = { ...r.data, blob }
      }
      puts.set(r.store, [...(puts.get(r.store) ?? []), value])
    }
    for (const [store, values] of puts) await db.raw.putMany(store, values)
    for (const [store, keys] of dels) await db.raw.delMany(store, keys)
    changed += [...puts.values()].reduce((s, v) => s + v.length, 0) + [...dels.values()].reduce((s, v) => s + v.length, 0)
    if (rows.length < PAGE) break
  }
  saveMeta(uid, { ...meta(uid), cursor })
  return changed
}

/** First sign-in on this device: take everything from the account, then upload what only this phone has. */
async function link(uid: string): Promise<number> {
  saveMeta(uid, { cursor: EPOCH, linked: false })
  const seen = new Map<db.StoreName, Set<string>>()
  const changed = await pull(uid, seen)
  for (const store of db.SYNCED) {
    const local = await db.getAllKeys(store)
    const remote = seen.get(store) ?? new Set()
    const only = local.filter((k) => !remote.has(k))
    if (only.length) await enqueue(store, only)
  }
  saveMeta(uid, { ...meta(uid), linked: true })
  return changed
}

// ---------- auth ----------
function setUser(id: string | null, email: string | null) {
  account.value = { ready: true, id, email }
  track(!!id)
}

export async function start() {
  if (!supa) {
    account.value = { ready: true, id: null, email: null }
    return
  }
  const { data } = await supa.auth.getSession()
  const u = data.session?.user
  setUser(u?.id ?? null, u?.email ?? null)
  supa.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') setUser(null, null)
    else if (session?.user && session.user.id !== account.value.id) setUser(session.user.id, session.user.email ?? null)
  })
  if (u) {
    syncState.value = { ...syncState.value, pending: (await db.getAllKeys('outbox')).length }
    schedule(300)
  }
  window.addEventListener('online', () => schedule(300))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(300))
  setInterval(() => document.visibilityState === 'visible' && schedule(0), 3 * 60000)
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supa) return 'Accounts are not available right now.'
  const { data, error } = await supa.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.user) return error?.message === 'Invalid login credentials' ? 'Wrong email or password.' : (error?.message ?? 'Sign in failed.')
  setUser(data.user.id, data.user.email ?? null)
  await syncNow()
  return null
}

export async function signUp(email: string, password: string): Promise<string | null> {
  const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) }).catch(() => null)
  if (!res) return 'No connection. Try again when you are online.'
  const j = await res.json().catch(() => ({}))
  if (!res.ok) return j.error ?? 'Could not create the account.'
  return signIn(email, password)
}

export async function changePassword(password: string): Promise<string | null> {
  if (!supa) return 'Accounts are not available.'
  const { error } = await supa.auth.updateUser({ password })
  return error ? error.message : null
}

async function wipeLocal() {
  for (const s of [...db.ALL_STORES, 'outbox', 'cache'] as db.StoreName[]) await db.raw.clear(s)
  await loadAll()
}

/** Upload anything pending, sign out and clear this phone. Returns an error message if data would be lost. */
export async function signOut(force = false): Promise<string | null> {
  if (!supa) return null
  const ok = await syncNow()
  const pending = (await db.getAllKeys('outbox')).length
  if ((!ok || pending) && !force) return `${pending || 'Some'} change${pending === 1 ? '' : 's'} could not be uploaded yet. Connect to the internet first, or sign out anyway and lose them.`
  const uid = account.value.id
  track(false)
  await supa.auth.signOut()
  if (uid) saveMeta(uid, { cursor: EPOCH, linked: false })
  setUser(null, null)
  syncState.value = { status: 'idle', last: null, pending: 0 }
  await wipeLocal()
  return null
}

export async function deleteAccount(): Promise<string | null> {
  if (!supa) return null
  const { data } = await supa.auth.getSession()
  const token = data.session?.access_token
  if (!token) return 'You are not signed in.'
  const res = await fetch('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
  if (!res) return 'No connection.'
  if (!res.ok) return (await res.json().catch(() => ({}))).error ?? 'Could not delete the account.'
  const uid = account.value.id
  track(false)
  await supa.auth.signOut({ scope: 'local' })
  if (uid) {
    try {
      localStorage.removeItem(`forkful-sync:${uid}`)
    } catch {
      /* ignore */
    }
  }
  setUser(null, null)
  syncState.value = { status: 'idle', last: null, pending: 0 }
  await wipeLocal()
  return null
}
