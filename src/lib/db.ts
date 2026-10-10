const DB_NAME = 'forkful'
const VERSION = 2

export type StoreName =
  | 'entries'
  | 'exercises'
  | 'days'
  | 'measurements'
  | 'photos'
  | 'foods'
  | 'recipes'
  | 'meals'
  | 'fasts'
  | 'cache'
  | 'kv'
  | 'outbox'

const KEYED: StoreName[] = ['entries', 'exercises', 'measurements', 'photos', 'foods', 'recipes', 'meals', 'fasts', 'cache']

/** Stores that follow the signed-in account to the cloud. */
export const SYNCED: StoreName[] = ['entries', 'exercises', 'days', 'measurements', 'photos', 'foods', 'recipes', 'meals', 'fasts', 'kv']

export const keyOf = (store: StoreName, v: Record<string, unknown>): string => String(store === 'days' ? v.day : store === 'kv' ? v.key : v.id)

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of KEYED) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'day' })
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

// ---------- change hook for cloud sync ----------
type Hook = (store: StoreName, keys: string[]) => void
let hook: Hook | null = null
export function onLocalWrite(fn: Hook | null) {
  hook = fn
}
const changed = (store: StoreName, keys: string[]) => {
  if (hook && keys.length && SYNCED.includes(store)) hook(store, keys)
}

// ---------- reads ----------
export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>
}

export async function getAllKeys(store: StoreName): Promise<string[]> {
  const db = await open()
  return (await wrap(db.transaction(store).objectStore(store).getAllKeys())).map(String)
}

export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>
}

// ---------- raw writes (no sync hook): used when applying cloud changes ----------
export const raw = {
  async putMany(store: StoreName, values: unknown[]) {
    if (!values.length) return
    const db = await open()
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const v of values) os.put(v)
    return done(tx)
  },
  async delMany(store: StoreName, keys: string[]) {
    if (!keys.length) return
    const db = await open()
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const k of keys) os.delete(k)
    return done(tx)
  },
  async clear(store: StoreName) {
    const db = await open()
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    return done(tx)
  },
}

// ---------- tracked writes ----------
export async function put(store: StoreName, value: unknown) {
  await raw.putMany(store, [value])
  changed(store, [keyOf(store, value as Record<string, unknown>)])
}

export async function putMany(store: StoreName, values: unknown[]) {
  await raw.putMany(store, values)
  changed(
    store,
    values.map((v) => keyOf(store, v as Record<string, unknown>)),
  )
}

export async function del(store: StoreName, key: string) {
  await raw.delMany(store, [key])
  changed(store, [key])
}

export async function delMany(store: StoreName, keys: string[]) {
  await raw.delMany(store, keys)
  changed(store, keys)
}

/** Local-only wipe; does not touch the cloud copy. */
export async function clear(store: StoreName) {
  return raw.clear(store)
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await get<{ key: string; value: T }>('kv', key)
  return row?.value
}

export async function kvSet(key: string, value: unknown) {
  return put('kv', { key, value })
}

export async function persist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* not supported */
  }
}

export const ALL_STORES: StoreName[] = ['entries', 'exercises', 'days', 'measurements', 'photos', 'foods', 'recipes', 'meals', 'fasts', 'kv']
