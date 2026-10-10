import { useEffect, useState } from 'preact/hooks'
import { account, accountSheet, cloudAvailable, sync, syncState } from '../lib/account'
import { say } from '../lib/store'
import { Icon } from './Icon'
import { Card, Field, Seg, Sheet, confirmBox, promptBox } from './ui'

export function AccountSheet() {
  const mode = accountSheet.value
  const [tab, setTab] = useState<'signup' | 'signin'>(mode ?? 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (mode) setTab(mode)
  }, [mode])
  if (!mode) return null
  const close = () => (accountSheet.value = null)

  const submit = async (e: Event) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const s = await sync()
    const error = tab === 'signup' ? await s.signUp(email, password) : await s.signIn(email, password)
    setBusy(false)
    if (error) return setErr(error)
    close()
    say(tab === 'signup' ? 'Account created. Your diary is backed up.' : 'Signed in. Your data is synced.')
  }

  return (
    <Sheet title={tab === 'signup' ? 'Create an account' : 'Sign in'} onClose={close}>
      <form onSubmit={submit}>
        <Seg
          value={tab}
          onChange={(t) => (setTab(t), setErr(''))}
          options={[
            { v: 'signup', label: 'New account' },
            { v: 'signin', label: 'I have one' },
          ]}
        />
        <p class="small muted">
          {tab === 'signup'
            ? 'Your diary, foods, recipes, weigh-ins and photos are backed up to your account and stay in sync on every phone you sign in on.'
            : 'Sign in to restore your data on this phone. Anything already on this phone is merged into your account.'}
        </p>
        <Field label="Email">
          <input class="input" type="email" autoComplete="email" required value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
        </Field>
        <Field label="Password" hint={tab === 'signup' ? 'At least 8 characters. Keep it safe, there is no reset by email yet.' : undefined}>
          <div class="row gap-s">
            <input class="input" type={show ? 'text' : 'password'} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} required minLength={tab === 'signup' ? 8 : undefined} value={password} onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)} />
            <button type="button" class="btn ghost icon" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
              <Icon name={show ? 'x' : 'eye'} />
            </button>
          </div>
        </Field>
        {err && <p class="small danger">{err}</p>}
        <button class="btn primary block" type="submit" disabled={busy || !email || !password}>
          {busy ? (tab === 'signup' ? 'Creating account...' : 'Signing in...') : tab === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </Sheet>
  )
}

function ago(ms: number | null) {
  if (!ms) return 'not yet'
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export function SyncStatus() {
  const s = syncState.value
  if (s.status === 'syncing') return <span class="tag">Syncing...</span>
  if (s.status === 'offline') return <span class="tag warn">Offline{s.pending ? `, ${s.pending} waiting` : ''}</span>
  if (s.status === 'error') return <span class="tag warn">Sync problem</span>
  return <span class="tag good">{s.pending ? `${s.pending} waiting` : `Synced ${ago(s.last)}`}</span>
}

export function AccountCard() {
  const a = account.value
  const s = syncState.value
  if (!cloudAvailable) return null
  if (!a.id)
    return (
      <Card>
        <div class="row gap">
          <span class="row-i">
            <Icon name="user" />
          </span>
          <div class="grow">
            <b>Back up your progress</b>
            <div class="small muted">Create a free account so your data survives a lost or new phone.</div>
          </div>
        </div>
        <div class="grid2 mt" style={{ gap: '0.5rem' }}>
          <button class="btn primary sm" onClick={() => (accountSheet.value = 'signup')}>
            Create account
          </button>
          <button class="btn outline sm" onClick={() => (accountSheet.value = 'signin')}>
            Sign in
          </button>
        </div>
      </Card>
    )
  return (
    <Card>
      <div class="row gap">
        <span class="row-i">
          <Icon name="user" />
        </span>
        <div class="grow" style={{ minWidth: 0 }}>
          <b class="ellipsis" style={{ display: 'block' }}>
            {a.email}
          </b>
          <div class="row gap-s mt-s">
            <SyncStatus />
          </div>
        </div>
      </div>
      {s.status === 'error' && <p class="small warn">{s.error}</p>}
      <div class="row wrap gap-s mt">
        <button
          class="btn sm soft"
          disabled={s.status === 'syncing'}
          onClick={async () => {
            const ok = await (await sync()).syncNow()
            say(ok ? 'Everything is synced' : 'Sync failed. Check your connection.')
          }}
        >
          <Icon name="refresh" size={0.9} /> Sync now
        </button>
        <button
          class="btn sm ghost"
          onClick={async () => {
            const pw = await promptBox('New password (at least 8 characters)', '', 'Change')
            if (!pw) return
            if (pw.length < 8) return say('Use at least 8 characters')
            const err = await (await sync()).changePassword(pw)
            say(err ?? 'Password changed')
          }}
        >
          Change password
        </button>
        <button
          class="btn sm ghost"
          onClick={async () => {
            if (!(await confirmBox('Sign out?', 'Your data stays safe in your account and is removed from this phone. Sign in again to get it back.', 'Sign out'))) return
            const s = await sync()
            let err = await s.signOut()
            if (err && (await confirmBox('Not everything is uploaded', err, 'Sign out anyway', true))) err = await s.signOut(true)
            else if (err) return
            say('Signed out')
          }}
        >
          Sign out
        </button>
      </div>
      <button
        class="btn ghost danger sm mt-s"
        onClick={async () => {
          if (!(await confirmBox('Delete your account?', 'This permanently deletes your account and everything stored in it, including photos, and clears this phone. Save a backup first if you want to keep anything.', 'Continue', true))) return
          const typed = await promptBox('Type DELETE to confirm', '', 'Delete account')
          if (typed?.trim().toUpperCase() !== 'DELETE') return
          const err = await (await sync()).deleteAccount()
          say(err ?? 'Account deleted')
        }}
      >
        Delete account
      </button>
    </Card>
  )
}

const BANNER_KEY = 'forkful-account-banner'

/** Nudge on the dashboard until there is an account. */
export function AccountBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem(BANNER_KEY) || 0) > Date.now()
    } catch {
      return false
    }
  })
  if (!cloudAvailable || !account.value.ready || account.value.id || hidden) return null
  return (
    <Card style={{ borderColor: 'var(--accent)' }}>
      <div class="row gap" style={{ alignItems: 'flex-start' }}>
        <span class="row-i">
          <Icon name="upload" />
        </span>
        <div class="grow">
          <b>Don't lose your progress</b>
          <div class="small muted">Your diary only lives on this phone. Create a free account to back it up and sync it.</div>
          <div class="row gap-s mt-s">
            <button class="btn primary sm" onClick={() => (accountSheet.value = 'signup')}>
              Create account
            </button>
            <button class="btn ghost sm" onClick={() => (accountSheet.value = 'signin')}>
              Sign in
            </button>
          </div>
        </div>
        <button
          class="btn ghost icon sm"
          aria-label="Hide for a week"
          onClick={() => {
            try {
              localStorage.setItem(BANNER_KEY, String(Date.now() + 7 * 86400000))
            } catch {
              /* ignore */
            }
            setHidden(true)
          }}
        >
          <Icon name="x" size={1} />
        </button>
      </div>
    </Card>
  )
}
