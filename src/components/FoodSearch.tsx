import { useEffect, useRef, useState } from 'preact/hooks'
import { dbState, defaultItem, fmtServing, itemNutr, loadDb, lookupBarcode, searchLocal, searchOnline, type Hit } from '../lib/foods'
import type { Match } from '../lib/parse'
import type { Food, Item } from '../lib/types'
import { fmtE, eUnit } from '../lib/units'
import { FoodSheet } from './FoodSheet'
import { Icon } from './Icon'
import { ScannerSheet } from './Scanner'
import { Num, Sheet } from './ui'
import { go } from '../lib/router'
import { say } from '../lib/store'

export function FoodRow({ food, item, onOpen, onQuick, sub }: { food: Food; item?: Item; onOpen: () => void; onQuick?: () => void; sub?: string }) {
  const it = item ?? defaultItem(food)
  const [done, setDone] = useState(false)
  return (
    <div class="food-row" role="button" tabIndex={0} onClick={onOpen}>
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="name">{food.name}</div>
        <div class="meta">
          {sub ?? (
            <>
              {food.brand ? `${food.brand}, ` : ''}
              {fmtServing(it.qty, food.units[it.unit])} · {fmtE(itemNutr(it).kcal ?? 0)} {eUnit()}
            </>
          )}
        </div>
      </div>
      {onQuick && (
        <button
          class={`quick-plus ${done ? 'done' : ''}`}
          aria-label={`Quick add ${food.name}`}
          onClick={(e) => {
            e.stopPropagation()
            if (done) return
            onQuick()
            setDone(true)
          }}
        >
          <Icon name={done ? 'check' : 'plus'} size={1.2} stroke={2.6} />
        </button>
      )}
    </div>
  )
}

/** Live search across your foods, the USDA database and Open Food Facts. */
export function useFoodSearch(q: string) {
  const [local, setLocal] = useState<Hit[]>([])
  const [online, setOnline] = useState<Food[]>([])
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const ac = useRef<AbortController | null>(null)
  useEffect(() => {
    loadDb()
  }, [])
  useEffect(() => {
    const query = q.trim()
    setLocal(query ? searchLocal(query) : [])
    ac.current?.abort()
    setOnline([])
    if (query.length < 3 || !navigator.onLine) {
      setOnlineState('idle')
      return
    }
    setOnlineState('loading')
    const ctrl = new AbortController()
    ac.current = ctrl
    const t = setTimeout(() => {
      searchOnline(query, ctrl.signal)
        .then((r) => {
          setOnline(r)
          setOnlineState('done')
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') setOnlineState('error')
        })
    }, 450)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, dbState.value])
  return { local, online, onlineState }
}

export function SearchResults({ q, onOpen, onQuick }: { q: string; onOpen: (f: Food) => void; onQuick?: (f: Food) => void }) {
  const { local, online, onlineState } = useFoodSearch(q)
  const mine = local.filter((h) => h.kind !== 'db')
  const dbHits = local.filter((h) => h.kind === 'db')
  return (
    <div>
      {mine.length > 0 && (
        <>
          <div class="section-t">Yours</div>
          <div class="card flush">
            {mine.slice(0, 12).map((h) => (
              <FoodRow key={h.food.id} food={h.food} onOpen={() => onOpen(h.food)} onQuick={onQuick && (() => onQuick(h.food))} />
            ))}
          </div>
        </>
      )}
      <div class="section-t">Food database</div>
      <div class="card flush">
        {dbState.value === 'loading' && <div class="listrow muted small">Loading the food database...</div>}
        {dbState.value === 'error' && (
          <button class="listrow small" onClick={() => loadDb()}>
            Could not load the food database. Tap to retry.
          </button>
        )}
        {dbState.value === 'ready' && dbHits.length === 0 && <div class="listrow muted small">No matches. Try fewer or different words.</div>}
        {dbHits.slice(0, 25).map((h) => (
          <FoodRow key={h.food.id} food={h.food} onOpen={() => onOpen(h.food)} onQuick={onQuick && (() => onQuick(h.food))} />
        ))}
      </div>
      <div class="section-t row between">
        <span>Brands and packaged foods</span>
        <span class="tiny" style={{ textTransform: 'none', letterSpacing: 0 }}>
          Open Food Facts
        </span>
      </div>
      <div class="card flush">
        {onlineState === 'loading' && <div class="listrow muted small">Searching online...</div>}
        {onlineState === 'idle' && <div class="listrow muted small">{navigator.onLine ? 'Type at least 3 letters to search brands.' : 'You are offline. Brand search needs a connection.'}</div>}
        {onlineState === 'error' && <div class="listrow muted small">Brand search is not reachable right now.</div>}
        {onlineState === 'done' && online.length === 0 && <div class="listrow muted small">No branded matches.</div>}
        {online.slice(0, 25).map((f) => (
          <FoodRow key={f.id} food={f} onOpen={() => onOpen(f)} onQuick={onQuick && (() => onQuick(f))} />
        ))}
      </div>
      <p class="tiny muted center-t mt">
        Can't find it?{' '}
        <a class="link" href="#/food/new">
          Create a food
        </a>
      </p>
    </div>
  )
}

/** Sheet to pick a food for a recipe or saved meal. */
export function FoodPicker({ onPick, onClose, title = 'Add ingredient' }: { onPick: (it: Item) => void; onClose: () => void; title?: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Food | null>(null)
  const [scan, setScan] = useState(false)
  return (
    <Sheet title={title} onClose={onClose} full>
      <div class="search">
        <Icon name="search" />
        <input class="input" autoFocus placeholder="Search foods" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
        <span class="search-btns">
          <button class="btn ghost icon" aria-label="Scan a barcode" onClick={() => setScan(true)}>
            <Icon name="scan" />
          </button>
        </span>
      </div>
      {q.trim() ? <SearchResults q={q} onOpen={setOpen} /> : <p class="small muted center-t mt">Search the database or scan a package.</p>}
      {open && <FoodSheet item={defaultItem(open)} day="" meal={0} onClose={() => setOpen(null)} onPick={(it) => (onPick(it), onClose())} />}
      {scan && (
        <ScannerSheet
          onClose={() => setScan(false)}
          onCode={async (code) => {
            setScan(false)
            try {
              const f = await lookupBarcode(code)
              if (f) setOpen(f)
              else say('Barcode not found. Try searching by name.')
            } catch {
              say('Lookup failed. Check your connection.')
            }
          }}
        />
      )}
    </Sheet>
  )
}

/** Review list for parsed lines (voice log, recipe import). */
export function MatchList({ matches, onChange }: { matches: Match[]; onChange: (m: Match[]) => void }) {
  const set = (i: number, m: Match | null) => onChange(m ? matches.map((x, j) => (j === i ? m : x)) : matches.filter((_, j) => j !== i))
  return (
    <div class="card flush">
      {matches.map((m, i) => {
        const it = m.item
        const options = it ? [it.food, ...m.alternatives.filter((a) => a.id !== it.food.id)] : m.alternatives
        return (
          <div key={i} class="listrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
            <div class="row between gap-s">
              <span class="small muted ellipsis">"{m.parsed.raw}"</span>
              <button class="btn ghost icon sm" aria-label="Remove line" onClick={() => set(i, null)}>
                <Icon name="x" size={1} />
              </button>
            </div>
            {options.length ? (
              <>
                <select
                  class="input"
                  value={it?.food.id}
                  onChange={(e) => {
                    const f = options.find((o) => o.id === (e.currentTarget as HTMLSelectElement).value)
                    if (f) set(i, { ...m, item: { food: f, qty: 1, unit: 0 } })
                  }}
                >
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.brand ? ` (${o.brand})` : ''}
                    </option>
                  ))}
                </select>
                {it && (
                  <div class="row gap-s">
                    <Num value={it.qty} onChange={(v) => set(i, { ...m, item: { ...it, qty: v ?? 0 } })} ariaLabel="Amount" />
                    <select class="input" value={it.unit} onChange={(e) => set(i, { ...m, item: { ...it, unit: +(e.currentTarget as HTMLSelectElement).value } })}>
                      {it.food.units.map((u, j) => (
                        <option key={j} value={j}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <span class="small bold num-t" style={{ minWidth: '3.5rem', textAlign: 'right' }}>
                      {fmtE(itemNutr(it).kcal ?? 0)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div class="small warn">
                No match found.{' '}
                <button class="link" onClick={() => go('/food/new')}>
                  Create it
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
