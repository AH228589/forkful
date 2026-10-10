import { useEffect, useRef, useState } from 'preact/hooks'
import { AiMealSheet } from '../components/AiMeal'
import { FoodSheet } from '../components/FoodSheet'
import { FoodRow, MatchList, SearchResults } from '../components/FoodSearch'
import { Icon } from '../components/Icon'
import { ScannerSheet } from '../components/Scanner'
import { Chip, Empty, Page, Seg, Sheet } from '../components/ui'
import { addDays, fmtDay } from '../lib/dates'
import { defaultItem, itemNutr, lookupBarcode, recipeFood, recipeTotals } from '../lib/foods'
import { matchLines, splitSpoken, type Match } from '../lib/parse'
import { go } from '../lib/router'
import { copyEntries, entriesByDay, foods, history, logItems, mealName, meals, recipes, say, settings } from '../lib/store'
import type { Day, Food, Item } from '../lib/types'
import { openSheet } from '../lib/uiState'
import { eUnit, fmtE } from '../lib/units'

type Tab = 'all' | 'meals' | 'recipes' | 'foods'

export function AddFood({ day, meal: initialMeal, tab: initialTab, scan, voice, ai, shared }: { day: Day; meal: number; tab: Tab; scan: boolean; voice: boolean; ai?: boolean; shared?: boolean }) {
  const [meal, setMeal] = useState(Math.min(initialMeal, settings.value.meals.length - 1))
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>(initialTab)
  const [open, setOpen] = useState<Item | null>(null)
  const [scanning, setScanning] = useState(scan)
  const [listening, setListening] = useState(voice)
  const [aiOpen, setAiOpen] = useState(!!ai)
  const [sort, setSort] = useState<'recent' | 'frequent'>('recent')
  const [multi, setMulti] = useState<string[]>([])
  const [looking, setLooking] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const quick = async (f: Food) => {
    await logItems(day, meal, [defaultItem(f)])
    say(`Added to ${mealName(meal)}`)
  }

  const onCode = async (code: string) => {
    setScanning(false)
    setLooking(true)
    try {
      const f = await lookupBarcode(code)
      if (f) setOpen(defaultItem(f))
      else {
        say('Not in the database yet. Add it once and it scans next time.')
        go(`/food/new?barcode=${code}`)
      }
    } catch {
      say('Lookup failed. Check your connection and try again.')
    } finally {
      setLooking(false)
    }
  }

  const hist = [...history.value].sort((a, b) => (sort === 'recent' ? b.last - a.last : b.count - a.count || b.last - a.last)).slice(0, 60)
  const yesterday = (entriesByDay.value.get(addDays(day, -1)) ?? []).filter((e) => e.meal === meal)

  return (
    <Page
      title={
        <select class="input" style={{ minHeight: '2.3rem', padding: '0.2rem 0.6rem', fontWeight: 700, width: 'auto', background: 'transparent' }} value={meal} onChange={(e) => setMeal(+(e.currentTarget as HTMLSelectElement).value)} aria-label="Meal">
          {settings.value.meals.map((n, i) => (
            <option key={i} value={i}>
              {n}
            </option>
          ))}
        </select>
      }
      sub={fmtDay(day)}
      backTo="/diary"
    >
      <div class="search">
        <Icon name="search" />
        <input ref={input} class="input" type="search" placeholder="Search for a food" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} enterKeyHint="search" />
        <span class="search-btns">
          {q ? (
            <button class="btn ghost icon" aria-label="Clear" onClick={() => (setQ(''), input.current?.focus())}>
              <Icon name="x" />
            </button>
          ) : (
            <button class="btn ghost icon" aria-label="Voice log" onClick={() => setListening(true)}>
              <Icon name="mic" />
            </button>
          )}
          <button class="btn ghost icon" aria-label="Scan a barcode" onClick={() => setScanning(true)}>
            <Icon name="scan" />
          </button>
        </span>
      </div>

      {looking && <div class="card small muted center-t mt">Looking up barcode...</div>}

      {q.trim() ? (
        <SearchResults q={q} onOpen={(f) => setOpen(defaultItem(f))} onQuick={quick} />
      ) : (
        <>
          <div class="chips" style={{ margin: '0.85rem 0' }}>
            <Chip onClick={() => setAiOpen(true)}>
              <span class="row gap-xs">
                <Icon name="sparkle" size={0.95} /> AI meal
              </span>
            </Chip>
            <Chip onClick={() => setScanning(true)}>
              <span class="row gap-xs">
                <Icon name="scan" size={0.95} /> Scan
              </span>
            </Chip>
            <Chip onClick={() => openSheet('quick', day, meal)}>
              <span class="row gap-xs">
                <Icon name="zap" size={0.95} /> Quick add
              </span>
            </Chip>
            <Chip onClick={() => setListening(true)}>
              <span class="row gap-xs">
                <Icon name="mic" size={0.95} /> Voice log
              </span>
            </Chip>
            <Chip onClick={() => go('/food/new')}>
              <span class="row gap-xs">
                <Icon name="plus" size={0.95} /> Create food
              </span>
            </Chip>
            <Chip onClick={() => go('/recipe/new')}>
              <span class="row gap-xs">
                <Icon name="recipe" size={0.95} /> New recipe
              </span>
            </Chip>
          </div>

          <Seg
            value={tab}
            onChange={(t) => (setTab(t), setMulti([]))}
            options={[
              { v: 'all', label: 'History' },
              { v: 'meals', label: 'My meals' },
              { v: 'recipes', label: 'Recipes' },
              { v: 'foods', label: 'My foods' },
            ]}
          />

          {tab === 'all' && (
            <>
              {yesterday.length > 0 && (
                <button
                  class="card row gap mt"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={async () => {
                    await copyEntries(yesterday, day, meal)
                    say(`Copied ${yesterday.length} food${yesterday.length === 1 ? '' : 's'} from yesterday`)
                    go('/diary')
                  }}
                >
                  <span class="row-i">
                    <Icon name="copy" />
                  </span>
                  <span class="grow">
                    <b>Same as yesterday's {mealName(meal).toLowerCase()}</b>
                    <div class="small muted">
                      {yesterday.length} food{yesterday.length === 1 ? '' : 's'} · {fmtE(yesterday.reduce((s, e) => s + (itemNutr(e).kcal ?? 0), 0))} {eUnit()}
                    </div>
                  </span>
                  <Icon name="plus" />
                </button>
              )}
              <div class="row between mt">
                <Seg
                  value={sort}
                  onChange={setSort}
                  options={[
                    { v: 'recent', label: 'Recent' },
                    { v: 'frequent', label: 'Most used' },
                  ]}
                />
                {hist.length > 0 && (
                  <button class="btn sm ghost" onClick={() => setMulti(multi.length ? [] : ['__on'])}>
                    {multi.length ? 'Cancel' : 'Select several'}
                  </button>
                )}
              </div>
              {hist.length === 0 ? (
                <Empty icon="history" title="No history yet">
                  Foods you log show up here so you can add them again in one tap.
                </Empty>
              ) : (
                <div class="card flush mt">
                  {hist.map((h) =>
                    multi.length ? (
                      <button key={h.food.id} class={`entry ${multi.includes(h.food.id) ? 'sel' : ''}`} onClick={() => setMulti(multi.includes(h.food.id) ? multi.filter((x) => x !== h.food.id) : [...multi, h.food.id])}>
                        <span class={`check ${multi.includes(h.food.id) ? 'on' : ''}`}>{multi.includes(h.food.id) && <Icon name="check" size={0.85} stroke={3} />}</span>
                        <div class="grow" style={{ minWidth: 0 }}>
                          <div class="name">{h.food.name}</div>
                          <div class="meta">
                            {fmtE(itemNutr(h).kcal ?? 0)} {eUnit()}
                          </div>
                        </div>
                      </button>
                    ) : (
                      <FoodRow key={h.food.id} food={h.food} item={h} onOpen={() => setOpen({ food: h.food, qty: h.qty, unit: h.unit })} onQuick={() => logItems(day, meal, [{ food: h.food, qty: h.qty, unit: h.unit }]).then(() => say(`Added to ${mealName(meal)}`))} />
                    ),
                  )}
                </div>
              )}
              {multi.length > 1 && (
                <button
                  class="btn primary block mt"
                  style={{ position: 'sticky', bottom: '1rem' }}
                  onClick={async () => {
                    const picks = hist.filter((h) => multi.includes(h.food.id)).map((h) => ({ food: h.food, qty: h.qty, unit: h.unit }))
                    await logItems(day, meal, picks)
                    say(`Added ${picks.length} foods`)
                    go('/diary')
                  }}
                >
                  Add {multi.length - 1} food{multi.length === 2 ? '' : 's'} to {mealName(meal)}
                </button>
              )}
            </>
          )}

          {tab === 'meals' && (
            <>
              <a class="btn soft block mt" href="#/meal/new">
                <Icon name="plus" size={1} /> Create a meal
              </a>
              {meals.value.length === 0 ? (
                <Empty icon="star" title="No saved meals">
                  Save foods you often eat together (from a diary meal's menu) and log them in one tap.
                </Empty>
              ) : (
                <div class="card flush mt">
                  {meals.value.map((m) => (
                    <FoodRow
                      key={m.id}
                      food={{ id: `m:${m.id}`, name: m.name, source: 'custom', n: recipeTotals(m), units: [{ label: '1 meal', f: 1 }] }}
                      sub={`${m.items.length} item${m.items.length === 1 ? '' : 's'} · ${fmtE(recipeTotals(m).kcal ?? 0)} ${eUnit()}`}
                      onOpen={() => go(`/meal/${m.id}?day=${day}&meal=${meal}`)}
                      onQuick={() => logItems(day, meal, m.items).then(() => say(`Added ${m.name}`))}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'recipes' && (
            <>
              <a class="btn soft block mt" href="#/recipe/new">
                <Icon name="plus" size={1} /> Create or import a recipe
              </a>
              {recipes.value.length === 0 ? (
                <Empty icon="recipe" title="No recipes yet">
                  Build a recipe from ingredients or import one from a recipe website. We work out the nutrition per serving.
                </Empty>
              ) : (
                <div class="card flush mt">
                  {recipes.value.map((r) => {
                    const f = recipeFood(r)
                    return <FoodRow key={r.id} food={f} onOpen={() => setOpen(defaultItem(f))} onQuick={() => quick(f)} />
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'foods' && (
            <>
              <a class="btn soft block mt" href="#/food/new">
                <Icon name="plus" size={1} /> Create a food
              </a>
              {foods.value.length === 0 ? (
                <Empty icon="apple" title="No custom foods">
                  Add foods from a nutrition label, like a local bakery item or your protein shake.
                </Empty>
              ) : (
                <div class="card flush mt">
                  {foods.value.map((f) => (
                    <FoodRow key={f.id} food={f} onOpen={() => setOpen(defaultItem(f))} onQuick={() => quick(f)} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {open && <FoodSheet item={open} day={day} meal={meal} onClose={() => setOpen(null)} />}
      {scanning && <ScannerSheet onCode={onCode} onClose={() => setScanning(false)} />}
      {aiOpen && <AiMealSheet day={day} meal={meal} shared={shared} onClose={() => setAiOpen(false)} />}
      {listening && <VoiceSheet day={day} meal={meal} onClose={() => setListening(false)} />}
    </Page>
  )
}

type Rec = { start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; lang: string; interimResults: boolean; continuous: boolean }

function VoiceSheet({ day, meal, onClose }: { day: Day; meal: number; onClose: () => void }) {
  const Ctor = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition
  const [text, setText] = useState('')
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const rec = useRef<Rec | null>(null)

  const start = () => {
    if (!Ctor) return
    setErr('')
    setMatches(null)
    const r = new Ctor()
    r.lang = navigator.language || 'en-US'
    r.interimResults = true
    r.continuous = false
    r.onresult = (e) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setText(t)
    }
    r.onerror = (e) => setErr(e.error === 'not-allowed' ? 'Microphone access was blocked.' : e.error === 'no-speech' ? 'Did not catch that. Try again.' : `Voice input failed (${e.error}).`)
    r.onend = () => setOn(false)
    rec.current = r
    r.start()
    setOn(true)
  }

  useEffect(() => {
    start()
    return () => rec.current?.abort()
  }, [])

  useEffect(() => {
    if (!on && text.trim()) matchLines(splitSpoken(text)).then(setMatches)
  }, [on])

  const items = (matches ?? []).filter((m) => m.item && m.item.qty > 0).map((m) => m.item as Item)

  return (
    <Sheet
      title="Voice log"
      onClose={onClose}
      actions={
        items.length > 0 && (
          <button
            class="btn primary sm"
            onClick={async () => {
              await logItems(day, meal, items)
              say(`Added ${items.length} food${items.length === 1 ? '' : 's'} to ${mealName(meal)}`)
              onClose()
            }}
          >
            Add {items.length}
          </button>
        )
      }
    >
      {!Ctor ? (
        <p class="small muted">Voice input is not supported in this browser. Chrome on Android supports it.</p>
      ) : (
        <>
          <button class={`mic-pulse ${on ? 'on' : ''}`} onClick={() => (on ? rec.current?.stop() : start())} aria-label={on ? 'Stop listening' : 'Start listening'}>
            <Icon name="mic" size={2.2} />
          </button>
          <p class="center-t small muted">{on ? 'Listening... say something like "two eggs, a slice of toast and a coffee with milk".' : 'Tap the mic to talk again.'}</p>
          {err && <p class="center-t small danger">{err}</p>}
          <textarea class="input" value={text} placeholder="What did you eat?" onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
          <button class="btn outline block mt-s" disabled={!text.trim()} onClick={() => matchLines(splitSpoken(text)).then(setMatches)}>
            <Icon name="refresh" size={1} /> Match foods
          </button>
          {matches && (
            <div class="mt">
              {matches.length ? <MatchList matches={matches} onChange={setMatches} /> : <p class="small muted">Nothing recognised.</p>}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
