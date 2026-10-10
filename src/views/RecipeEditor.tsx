import { useState } from 'preact/hooks'
import { FoodPicker, MatchList } from '../components/FoodSearch'
import { FoodSheet, MacroStrip, NutritionLabel } from '../components/FoodSheet'
import { Icon } from '../components/Icon'
import { Card, Field, Num, Page, Sheet, confirmBox } from '../components/ui'
import { today } from '../lib/dates'
import { fmtServing, itemNutr, recipeTotals } from '../lib/foods'
import { scale } from '../lib/nutrients'
import { matchLines, type Match } from '../lib/parse'
import { back, go } from '../lib/router'
import { deleteRecipe, diaryDay, recipes, saveRecipe, say, uid } from '../lib/store'
import type { Item, Recipe } from '../lib/types'
import { eUnit, fmtE } from '../lib/units'

export function RecipeEditor({ id }: { id: string | null }) {
  const existing = id ? recipes.value.find((r) => r.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [servings, setServings] = useState<number | undefined>(existing?.servings ?? 4)
  const [items, setItems] = useState<Item[]>(existing?.items ?? [])
  const [note, setNote] = useState(existing?.note ?? '')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [picking, setPicking] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [importing, setImporting] = useState<'url' | 'paste' | null>(null)

  const r: Recipe = { id: existing?.id ?? uid(), name: name.trim() || 'Untitled recipe', servings: Math.max(1, servings ?? 1), items, note, url: url || undefined, created: existing?.created ?? Date.now(), updated: Date.now() }
  const per = scale(recipeTotals(r), 1 / r.servings)

  const save = async () => {
    if (!name.trim() || !items.length) return say('Give it a name and at least one ingredient')
    await saveRecipe(r)
    say('Recipe saved')
    back('/add?tab=recipes')
  }

  return (
    <Page
      title={existing ? 'Edit recipe' : 'New recipe'}
      backTo="/add?tab=recipes"
      actions={
        <button class="btn primary sm" onClick={save} disabled={!name.trim() || !items.length}>
          <Icon name="check" size={1} /> Save
        </button>
      }
    >
      <Card>
        <Field label="Recipe name">
          <input class="input" value={name} placeholder="e.g. Chicken curry" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </Field>
        <Field label="Number of servings">
          <Num value={servings} onChange={setServings} />
        </Field>
      </Card>

      {!items.length && (
        <div class="grid2" style={{ gap: '0.6rem', marginBottom: '0.85rem' }}>
          <button class="btn outline" onClick={() => setImporting('url')}>
            <Icon name="link" size={1} /> Import from web
          </button>
          <button class="btn outline" onClick={() => setImporting('paste')}>
            <Icon name="list" size={1} /> Paste ingredients
          </button>
        </div>
      )}

      <Card title={`Ingredients (${items.length})`} class="flush" action={<span class="small muted" style={{ paddingRight: '1rem' }}>{fmtE(recipeTotals(r).kcal ?? 0)} {eUnit()} total</span>}>
        {items.map((it, i) => (
          <div key={i} class="entry">
            <button class="grow" style={{ minWidth: 0, textAlign: 'left' }} onClick={() => setEditIdx(i)}>
              <div class="name">{it.food.name}</div>
              <div class="meta">{fmtServing(it.qty, it.food.units[it.unit])}</div>
            </button>
            <span class="kcal">{fmtE(itemNutr(it).kcal ?? 0)}</span>
            <button class="btn ghost icon sm" aria-label="Remove ingredient" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              <Icon name="x" size={1} />
            </button>
          </div>
        ))}
        <button class="meal-add" onClick={() => setPicking(true)}>
          <Icon name="plus" size={1} stroke={2.6} /> ADD INGREDIENT
        </button>
        {items.length > 0 && (
          <div class="row gap-s" style={{ padding: '0 1rem 0.75rem' }}>
            <button class="btn sm ghost" onClick={() => setImporting('paste')}>
              <Icon name="list" size={0.9} /> Paste more
            </button>
            <button class="btn sm ghost" onClick={() => setImporting('url')}>
              <Icon name="link" size={0.9} /> Import
            </button>
          </div>
        )}
      </Card>

      {items.length > 0 && (
        <Card title="Per serving">
          <MacroStrip n={per} />
          <div class="mt">
            <NutritionLabel n={per} serving={`1 of ${r.servings} servings`} />
          </div>
        </Card>
      )}

      <Card title="Directions and notes">
        <textarea class="input" value={note} placeholder="Optional" onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
        {url && (
          <a class="small link" href={url} target="_blank" rel="noopener noreferrer">
            Original recipe
          </a>
        )}
      </Card>

      {existing && (
        <div class="col gap-s">
          <button
            class="btn soft block"
            onClick={async () => {
              await saveRecipe(r)
              go(`/add?day=${diaryDay.value || today()}&tab=recipes`)
            }}
          >
            <Icon name="utensils" size={1} /> Log a serving
          </button>
          <button
            class="btn ghost danger block"
            onClick={async () => {
              if (await confirmBox('Delete this recipe?', 'Past diary entries keep their values.', 'Delete', true)) {
                await deleteRecipe(existing.id)
                back('/add?tab=recipes')
              }
            }}
          >
            <Icon name="trash" size={1} /> Delete recipe
          </button>
        </div>
      )}

      {picking && <FoodPicker onClose={() => setPicking(false)} onPick={(it) => setItems([...items, it])} />}
      {editIdx != null && <FoodSheet item={items[editIdx]} day="" meal={0} pickLabel="Update" onClose={() => setEditIdx(null)} onPick={(it) => setItems(items.map((x, j) => (j === editIdx ? it : x)))} />}
      {importing && (
        <ImportSheet
          mode={importing}
          onClose={() => setImporting(null)}
          onDone={(res) => {
            if (res.name && !name.trim()) setName(res.name)
            if (res.servings) setServings(res.servings)
            if (res.url) setUrl(res.url)
            if (res.note && !note) setNote(res.note)
            setItems([...items, ...res.items])
            setImporting(null)
          }}
        />
      )}
    </Page>
  )
}

interface ImportRes {
  name?: string
  servings?: number
  url?: string
  note?: string
  items: Item[]
}

function ImportSheet({ mode, onClose, onDone }: { mode: 'url' | 'paste'; onClose: () => void; onDone: (r: ImportRes) => void }) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [meta, setMeta] = useState<Omit<ImportRes, 'items'>>({})
  const [matches, setMatches] = useState<Match[] | null>(null)

  const fromUrl = async () => {
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(`/api/recipe?url=${encodeURIComponent(url.trim())}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Import failed')
      setMeta({ name: j.name, servings: j.servings, url: url.trim(), note: j.instructions })
      setText((j.ingredients as string[]).join('\n'))
      setMatches(await matchLines(j.ingredients))
    } catch (e) {
      setErr((e as Error).message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const fromText = async () => {
    setBusy(true)
    setMatches(await matchLines(text.split(/\n+/).filter((l) => l.trim())))
    setBusy(false)
  }

  const ready = (matches ?? []).filter((m) => m.item && m.item.qty > 0).map((m) => m.item as Item)

  return (
    <Sheet
      title={mode === 'url' ? 'Import a recipe' : 'Paste ingredients'}
      onClose={onClose}
      full
      actions={
        ready.length > 0 && (
          <button class="btn primary sm" onClick={() => onDone({ ...meta, items: ready })}>
            Add {ready.length}
          </button>
        )
      }
    >
      {mode === 'url' && !matches && (
        <>
          <p class="small muted" style={{ marginTop: 0 }}>
            Paste a link to a recipe page. Most big recipe sites work. We read the ingredient list and match each line to a food.
          </p>
          <Field label="Recipe link">
            <input class="input" type="url" placeholder="https://..." value={url} onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)} />
          </Field>
          <button class="btn primary block" disabled={busy || !/^https?:\/\//.test(url.trim())} onClick={fromUrl}>
            {busy ? 'Importing...' : 'Import'}
          </button>
          {err && <p class="small danger">{err}. You can also paste the ingredient list instead.</p>}
        </>
      )}
      {mode === 'paste' && !matches && (
        <>
          <Field label="One ingredient per line">
            <textarea class="input" style={{ minHeight: '12rem' }} placeholder={'2 cups rice\n500 g chicken breast\n1 tbsp olive oil\n1 large onion'} value={text} onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
          </Field>
          <button class="btn primary block" disabled={busy || !text.trim()} onClick={fromText}>
            {busy ? 'Matching...' : 'Match ingredients'}
          </button>
        </>
      )}
      {matches && (
        <>
          {meta.name && (
            <p class="bold" style={{ marginTop: 0 }}>
              {meta.name}
              {meta.servings ? <span class="muted"> · {meta.servings} servings</span> : null}
            </p>
          )}
          <p class="small muted" style={{ marginTop: 0 }}>
            Check each match and fix the amounts if needed.
          </p>
          <MatchList matches={matches} onChange={setMatches} />
        </>
      )}
    </Sheet>
  )
}

