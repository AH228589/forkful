import { signal } from '@preact/signals'
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { back } from '../lib/router'
import { Icon } from './Icon'

export function Seg<T extends string | number>({ value, options, onChange, class: cls }: { value: T; options: { v: T; label: ComponentChildren }[]; onChange: (v: T) => void; class?: string }) {
  return (
    <div class={`seg ${cls || ''}`} role="tablist">
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="tab" aria-selected={o.v === value} class={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" class={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

let openSheets = 0

export function Sheet({ title, onClose, children, actions, full }: { title: ComponentChildren; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren; full?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    openSheets++
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', k)
      openSheets--
      if (!openSheets) document.body.style.overflow = ''
    }
  }, [])
  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${full ? 'full' : ''}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div class="sheet-h">
          <button class="btn ghost icon" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
          <h2>{title}</h2>
          <div class="row gap-s">{actions}</div>
        </div>
        <div class="sheet-b">{children}</div>
      </div>
    </div>
  )
}

export function Page({ title, children, actions, backTo = '/', sub }: { title: ComponentChildren; children: ComponentChildren; actions?: ComponentChildren; backTo?: string | null; sub?: ComponentChildren }) {
  return (
    <div class="page">
      <header class="pagebar">
        {backTo !== null && (
          <button class="btn ghost icon" onClick={() => back(backTo)} aria-label="Back">
            <Icon name="left" />
          </button>
        )}
        <div class="grow" style={{ minWidth: 0 }}>
          <h1 class="ellipsis">{title}</h1>
          {sub && <div class="tiny muted">{sub}</div>}
        </div>
        <div class="row gap-s">{actions}</div>
      </header>
      {children}
    </div>
  )
}

export function Card({ title, icon, action, children, class: cls, style, onClick }: { title?: ComponentChildren; icon?: string; action?: ComponentChildren; children: ComponentChildren; class?: string; style?: JSX.CSSProperties; onClick?: () => void }) {
  return (
    <section class={`card ${onClick ? 'tap' : ''} ${cls || ''}`} style={style} onClick={onClick}>
      {(title || action) && (
        <div class="card-h">
          <h3>
            {icon && <Icon name={icon} size={1.05} />}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="icon-big">
        <Icon name={icon} size={1.6} />
      </div>
      <h3>{title}</h3>
      {children && <div class="muted small">{children}</div>}
    </div>
  )
}

export function Bar({ value, color = 'var(--accent)', over = 'var(--critical)' }: { value: number; color?: string; over?: string }) {
  const v = Math.max(0, value)
  return (
    <div class="bar">
      <i style={{ width: `${Math.min(1, v) * 100}%`, background: v > 1.0001 ? over : color }} />
    </div>
  )
}

export function Ring({ share, size = 8, stroke = 9, color = 'var(--accent)', track = 'var(--track)', children, over }: { share: number; size?: number; stroke?: number; color?: string; track?: string; children?: ComponentChildren; over?: boolean }) {
  const r = 50 - stroke / 2 - 1
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, share))
  return (
    <div class="ring" style={{ width: `${size}rem`, height: `${size}rem` }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} stroke-width={stroke} />
        {v > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={over ? 'var(--critical)' : color} stroke-width={stroke} stroke-linecap="round" stroke-dasharray={`${c * v} ${c}`} transform="rotate(-90 50 50)" style={{ transition: 'stroke-dasharray .5s ease' }} />}
      </svg>
      <div class="ring-c">{children}</div>
    </div>
  )
}

export function Donut({ parts, size = 7, stroke = 16, children }: { parts: { v: number; color: string }[]; size?: number; stroke?: number; children?: ComponentChildren }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.v), 0)
  const r = 50 - stroke / 2
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div class="ring" style={{ width: `${size}rem`, height: `${size}rem` }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--track)" stroke-width={stroke} />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (Math.max(0, p.v) / total) * c
            const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={p.color} stroke-width={stroke} stroke-dasharray={`${Math.max(0, len - 0.6)} ${c}`} stroke-dashoffset={-acc} transform="rotate(-90 50 50)" />
            acc += len
            return el
          })}
      </svg>
      <div class="ring-c">{children}</div>
    </div>
  )
}

/** Numeric input that keeps what the user types (including a trailing dot). */
export function Num({ value, onChange, step = 'any', min, placeholder, class: cls, autoFocus, suffix, id, ariaLabel }: { value: number | undefined | null; onChange: (v: number | undefined) => void; step?: string; min?: number; placeholder?: string; class?: string; autoFocus?: boolean; suffix?: string; id?: string; ariaLabel?: string }) {
  const [text, setText] = useState(value == null || Number.isNaN(value) ? '' : String(round(value)))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const cur = parseFloat(text.replace(',', '.'))
    if (value == null) {
      if (text !== '' && document.activeElement !== ref.current) setText('')
    } else if (Math.abs(cur - value) > 1e-9 || Number.isNaN(cur)) setText(String(round(value)))
  }, [value])
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.select(), 60)
  }, [])
  return (
    <div class={`num ${cls || ''}`}>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        step={step}
        min={min}
        onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
        onInput={(e) => {
          const t = (e.currentTarget as HTMLInputElement).value
          setText(t)
          const v = parseFloat(t.replace(',', '.'))
          onChange(t.trim() === '' || Number.isNaN(v) ? undefined : v)
        }}
      />
      {suffix && <span class="suffix">{suffix}</span>}
    </div>
  )
}

const round = (v: number) => Math.round(v * 100) / 100

export function Field({ label, children, hint }: { label: ComponentChildren; children: ComponentChildren; hint?: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-l">{label}</span>
      {children}
      {hint && <span class="tiny muted">{hint}</span>}
    </label>
  )
}

export function Row({ icon, title, sub, right, onClick, href, danger }: { icon?: string; title: ComponentChildren; sub?: ComponentChildren; right?: ComponentChildren; onClick?: () => void; href?: string; danger?: boolean }) {
  const body = (
    <>
      {icon && (
        <span class="row-i">
          <Icon name={icon} size={1.15} />
        </span>
      )}
      <span class="grow" style={{ minWidth: 0 }}>
        <span class={`row-t ${danger ? 'danger' : ''}`}>{title}</span>
        {sub && <span class="row-s">{sub}</span>}
      </span>
      {right ?? ((onClick || href) && <Icon name="right" size={1} class="muted" />)}
    </>
  )
  if (href)
    return (
      <a class="listrow" href={href}>
        {body}
      </a>
    )
  if (onClick)
    return (
      <button class="listrow" type="button" onClick={onClick}>
        {body}
      </button>
    )
  return <div class="listrow">{body}</div>
}

// ---------- confirm / prompt dialogs ----------
type Ask = { title: string; body?: string; ok: string; danger?: boolean; input?: string; resolve: (v: string | boolean | null) => void }
export const asking = signal<Ask | null>(null)

export function confirmBox(title: string, body?: string, ok = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => (asking.value = { title, body, ok, danger, resolve: (v) => resolve(!!v) }))
}

export function promptBox(title: string, initial = '', ok = 'Save'): Promise<string | null> {
  return new Promise((resolve) => (asking.value = { title, ok, input: initial, resolve: (v) => resolve(typeof v === 'string' ? v : null) }))
}

export function AskHost() {
  const a = asking.value
  const [val, setVal] = useState('')
  useEffect(() => setVal(a?.input ?? ''), [a])
  if (!a) return null
  const close = (v: string | boolean | null) => {
    asking.value = null
    a.resolve(v)
  }
  return (
    <div class="backdrop center" onClick={(e) => e.target === e.currentTarget && close(null)}>
      <form
        class="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          close(a.input != null ? val : true)
        }}
      >
        <h3>{a.title}</h3>
        {a.body && <p class="muted small">{a.body}</p>}
        {a.input != null && <input class="input" value={val} autoFocus onInput={(e) => setVal((e.currentTarget as HTMLInputElement).value)} />}
        <div class="row end gap-s" style={{ marginTop: '1rem' }}>
          <button type="button" class="btn ghost" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="submit" class={`btn ${a.danger ? 'danger' : 'primary'}`}>
            {a.ok}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Action menu anchored as a bottom sheet. */
export function Menu({ title, items, onClose }: { title?: string; items: ({ icon?: string; label: string; danger?: boolean; fn: () => void } | null | false)[]; onClose: () => void }) {
  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet menu" role="menu">
        {title && <div class="menu-t">{title}</div>}
        {items.filter(Boolean).map((it) => {
          const i = it as { icon?: string; label: string; danger?: boolean; fn: () => void }
          return (
            <button
              key={i.label}
              class={`listrow ${i.danger ? 'danger' : ''}`}
              role="menuitem"
              onClick={() => {
                onClose()
                i.fn()
              }}
            >
              {i.icon && (
                <span class="row-i">
                  <Icon name={i.icon} size={1.15} />
                </span>
              )}
              <span class="row-t">{i.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Chip({ on, children, onClick }: { on?: boolean; children: ComponentChildren; onClick?: () => void }) {
  return (
    <button type="button" class={`chip ${on ? 'on' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}
