import { useState } from 'preact/hooks'
import { Icon } from '../components/Icon'
import { ScannerSheet } from '../components/Scanner'
import { Card, Field, Num, Page, Seg, confirmBox } from '../components/ui'
import { massUnits } from '../lib/foods'
import { LABEL_ORDER, NUTRIENTS, scale, type Nutr, type NutrientKey } from '../lib/nutrients'
import { back } from '../lib/router'
import { deleteFood, foods, saveFood, say, uid } from '../lib/store'
import type { Food, Unit } from '../lib/types'
import { eFrom, eTo, eUnit } from '../lib/units'

export function CreateFood({ id, barcode }: { id: string | null; barcode?: string }) {
  const existing = id ? foods.value.find((f) => f.id === id) : undefined
  const form = existing?.form
  const per100Init = form?.per100 ?? false
  // values shown in the form: per serving, or per 100 g
  const initN: Nutr = existing ? (per100Init ? scale(existing.n, 1) : existing.n) : {}
  const [name, setName] = useState(existing?.name ?? '')
  const [brand, setBrand] = useState(existing?.brand ?? '')
  const [code, setCode] = useState(existing?.barcode ?? barcode ?? '')
  const [label, setLabel] = useState(form?.label ?? '1 serving')
  const [grams, setGrams] = useState<number | undefined>(form?.grams)
  const [per100, setPer100] = useState(per100Init)
  const [n, setN] = useState<Nutr>({ ...initN, kcal: initN.kcal != null ? eTo(initN.kcal) : undefined })
  const [scan, setScan] = useState(false)

  const setK = (k: NutrientKey, v: number | undefined) => setN({ ...n, [k]: v })
  const ok = !!name.trim() && n.kcal != null

  const save = async () => {
    if (!ok) return
    const values: Nutr = { ...n, kcal: eFrom(n.kcal ?? 0) }
    for (const k of Object.keys(values) as NutrientKey[]) if (values[k] == null || Number.isNaN(values[k])) delete values[k]
    const servLabel = /^\d/.test(label.trim()) ? label.trim() : `1 ${label.trim() || 'serving'}`
    let units: Unit[]
    if (per100) {
      units = grams ? [{ label: servLabel, g: grams, f: grams / 100 }, ...massUnits(100)] : massUnits(100)
    } else {
      units = [{ label: servLabel, g: grams, f: 1 }]
      if (grams) units.push(...massUnits(grams))
    }
    const food: Food = {
      ...(existing ?? {}),
      id: existing?.id ?? `u:${uid()}`,
      name: name.trim(),
      brand: brand.trim() || undefined,
      source: 'custom',
      n: values,
      units,
      barcode: code.replace(/\D/g, '') || undefined,
      form: { label: servLabel, grams, per100 },
    }
    await saveFood(food)
    say(existing ? 'Food updated' : 'Food created. Find it under My foods.')
    back('/add?tab=foods')
  }

  return (
    <Page
      title={existing ? 'Edit food' : 'Create a food'}
      backTo="/add"
      actions={
        <button class="btn primary sm" disabled={!ok} onClick={save}>
          <Icon name="check" size={1} /> Save
        </button>
      }
    >
      <Card>
        <Field label="Description">
          <input class="input" value={name} placeholder="e.g. Banitsa with cheese" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </Field>
        <Field label="Brand (optional)">
          <input class="input" value={brand} onInput={(e) => setBrand((e.currentTarget as HTMLInputElement).value)} />
        </Field>
        <Field label="Barcode (optional)">
          <div class="row gap-s">
            <input class="input" inputMode="numeric" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} />
            <button class="btn icon" type="button" onClick={() => setScan(true)} aria-label="Scan barcode">
              <Icon name="scan" />
            </button>
          </div>
        </Field>
      </Card>

      <Card title="Serving">
        <Field label="Label shows values">
          <Seg
            value={per100 ? '100' : 'serving'}
            options={[
              { v: 'serving', label: 'Per serving' },
              { v: '100', label: 'Per 100 g / ml' },
            ]}
            onChange={(v) => setPer100(v === '100')}
          />
        </Field>
        <div class="grid2">
          <Field label="Serving size">
            <input class="input" value={label} placeholder="1 bar" onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
          </Field>
          <Field label={per100 ? 'Grams per serving' : 'Grams per serving (optional)'}>
            <Num value={grams} onChange={setGrams} suffix="g" />
          </Field>
        </div>
      </Card>

      <Card title={per100 ? 'Nutrition per 100 g' : 'Nutrition per serving'}>
        {LABEL_ORDER.map((k) => (
          <div key={k} class="row gap" style={{ marginBottom: '0.5rem' }}>
            <span class={`grow small ${NUTRIENTS[k].indent ? 'muted' : 'bold'}`} style={{ paddingLeft: NUTRIENTS[k].indent ? '0.75rem' : 0 }}>
              {NUTRIENTS[k].label}
              {k === 'kcal' && ' *'}
            </span>
            <div style={{ width: '9rem' }}>
              <Num value={n[k]} onChange={(v) => setK(k, v)} suffix={k === 'kcal' ? eUnit() : NUTRIENTS[k].unit} />
            </div>
          </div>
        ))}
        <p class="tiny muted">* required. Leave anything you don't know empty.</p>
      </Card>

      {existing && (
        <button
          class="btn ghost danger block"
          onClick={async () => {
            if (await confirmBox('Delete this food?', 'Past diary entries keep their values.', 'Delete', true)) {
              await deleteFood(existing.id)
              back('/add?tab=foods')
            }
          }}
        >
          <Icon name="trash" size={1} /> Delete food
        </button>
      )}
      {scan && (
        <ScannerSheet
          onClose={() => setScan(false)}
          onCode={(c) => {
            setCode(c)
            setScan(false)
          }}
        />
      )}
    </Page>
  )
}
