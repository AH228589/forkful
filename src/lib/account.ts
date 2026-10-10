import { signal } from '@preact/signals'

// Light module: the Supabase client lives in sync.ts and loads on demand.
export const cloudAvailable = !!(import.meta.env.NEXT_PUBLIC_SUPABASE_URL && (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))

export const account = signal<{ ready: boolean; id: string | null; email: string | null }>({ ready: !cloudAvailable, id: null, email: null })

export const syncState = signal<{ status: 'idle' | 'syncing' | 'error' | 'offline'; last: number | null; pending: number; error?: string }>({ status: 'idle', last: null, pending: 0 })

/** Which account sheet is open, if any. */
export const accountSheet = signal<'signup' | 'signin' | null>(null)

export const sync = () => import('./sync')
