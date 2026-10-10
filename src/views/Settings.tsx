import { useState } from 'preact/hooks'
import { Icon } from '../components/Icon'
import { Card, Chip, Field, Page, Row, Seg, Switch, confirmBox, promptBox } from '../components/ui'
import { today } from '../lib/dates'
import { dbSource } from '../lib/foods'
import { backupJson, deliver, diaryCsv, exerciseCsv, importCsv, lastNDays, measurementCsv, restoreJson, summaryCsv, wipeAll } from '../lib/io'
import { NUTRIENTS, type NutrientKey } from '../lib/nutrients'
import { notify, remindersIcs } from '../lib/reminders'
import { entries, saveSettings, say, settings } from '../lib/store'
import type { Settings } from '../lib/types'

const NUT_CHOICES: NutrientKey[] = ['carbs', 'fat', 'protein', 'fiber', 'sugar', 'sodium', 'satFat', 'chol', 'potassium', 'calcium', 'iron', 'vitA', 'vitC', 'vitD', 'transFat', 'monoFat', 'polyFat']

function SwitchRow({ label, sub, k }: { label: string; sub?: string; k: keyof Settings }) {
  const on = !!settings.value[k]
  return (
    <div class="listrow">
      <span class="grow">
        <span class="row-t">{label}</span>
        {sub && <span class="row-s">{sub}</span>}
      </span>
      <Switch label={label} on={on} onChange={(v) => saveSettings({ [k]: v } as Partial<Settings>)} />
    </div>
  )
}

export function SettingsView() {
  const s = settings.value
  const [range, setRange] = useState(30)
  const [busy, setBusy] = useState(false)
  const toggleCol = (list: string[], k: string, max: number) => (list.includes(k) ? list.filter((x) => x !== k) : list.length >= max ? [...list.slice(1), k] : [...list, k])
  const [from, to] = range ? lastNDays(range) : ['0000-01-01', today()]

  const readFile = (accept: string, fn: (text: string) => Promise<void>) => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = accept
    inp.onchange = async () => {
      const f = inp.files?.[0]
      if (!f) return
      setBusy(true)
      try {
        await fn(await f.text())
      } catch (e) {
        say((e as Error).message || 'Import failed')
      } finally {
        setBusy(false)
      }
    }
    inp.click()
  }

  return (
    <Page title="Settings" backTo="/more">
      <div class="section-t">Appearance</div>
      <Card>
        <Seg
          value={s.theme}
          onChange={(theme) => saveSettings({ theme })}
          options={[
            { v: 'system', label: 'Auto' },
            { v: 'light', label: 'Light' },
            { v: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

      <div class="section-t">Units</div>
      <Card>
        <Field label="Weight">
          <Seg value={s.weightUnit} onChange={(weightUnit) => saveSettings({ weightUnit })} options={[{ v: 'kg', label: 'kg' }, { v: 'lb', label: 'lb' }, { v: 'st', label: 'st & lb' }]} />
        </Field>
        <Field label="Height">
          <Seg value={s.heightUnit} onChange={(heightUnit) => saveSettings({ heightUnit })} options={[{ v: 'cm', label: 'cm' }, { v: 'ftin', label: 'ft & in' }]} />
        </Field>
        <Field label="Body measurements">
          <Seg value={s.lengthUnit} onChange={(lengthUnit) => saveSettings({ lengthUnit })} options={[{ v: 'cm', label: 'cm' }, { v: 'in', label: 'in' }]} />
        </Field>
        <Field label="Energy">
          <Seg value={s.energyUnit} onChange={(energyUnit) => saveSettings({ energyUnit })} options={[{ v: 'kcal', label: 'Calories' }, { v: 'kJ', label: 'Kilojoules' }]} />
        </Field>
        <Field label="Water">
          <Seg value={s.waterUnit} onChange={(waterUnit) => saveSettings({ waterUnit })} options={[{ v: 'ml', label: 'ml' }, { v: 'floz', label: 'fl oz' }, { v: 'cup', label: 'cups' }]} />
        </Field>
      </Card>

      <div class="section-t">Diary</div>
      <div class="card flush">
        {s.meals.map((m, i) => (
          <Row
            key={i}
            icon="utensils"
            title={m}
            sub={`Meal ${i + 1}`}
            onClick={async () => {
              const name = await promptBox('Rename meal', m)
              if (name?.trim()) saveSettings({ meals: s.meals.map((x, j) => (j === i ? name.trim() : x)) })
            }}
          />
        ))}
        <div class="row gap-s" style={{ padding: '0.6rem 1rem' }}>
          <button
            class="btn sm soft"
            disabled={s.meals.length >= 6}
            onClick={async () => {
              const name = await promptBox('New meal name', `Meal ${s.meals.length + 1}`)
              if (name?.trim()) saveSettings({ meals: [...s.meals, name.trim()] })
            }}
          >
            <Icon name="plus" size={0.9} /> Add meal
          </button>
          <button
            class="btn sm ghost"
            disabled={s.meals.length <= 1}
            onClick={async () => {
              const last = s.meals.length - 1
              const used = entries.value.some((e) => e.meal === last)
              if (used && !(await confirmBox(`Remove "${s.meals[last]}"?`, 'Foods logged in it stay saved but are hidden until you add the meal back.', 'Remove', true))) return
              saveSettings({ meals: s.meals.slice(0, -1) })
            }}
          >
            Remove last
          </button>
        </div>
      </div>
      <div class="card flush">
        <SwitchRow label="Net carbs" sub="Show carbs minus fiber everywhere" k="netCarbs" />
        <SwitchRow label="Food timestamps" sub="Record and show the time you ate" k="timestamps" />
        <SwitchRow label="Macros under each meal" k="mealMacros" />
        <div class="listrow">
          <span class="grow">
            <span class="row-t">Week starts on</span>
          </span>
          <Seg value={s.weekStart} onChange={(weekStart) => saveSettings({ weekStart })} options={[{ v: 1, label: 'Mon' }, { v: 0, label: 'Sun' }]} />
        </div>
      </div>
      <Card title="Diary footer nutrients" action={<span class="tiny muted">pick up to 5</span>}>
        <div class="row wrap gap-xs">
          {NUT_CHOICES.map((k) => (
            <Chip key={k} on={s.diaryCols.includes(k)} onClick={() => saveSettings({ diaryCols: toggleCol(s.diaryCols, k, 5) })}>
              {NUTRIENTS[k].short}
            </Chip>
          ))}
        </div>
      </Card>
      <Card title="Dashboard 'My nutrients'" action={<span class="tiny muted">pick 3</span>}>
        <div class="row wrap gap-xs">
          {NUT_CHOICES.map((k) => (
            <Chip key={k} on={s.dashCustom.includes(k)} onClick={() => saveSettings({ dashCustom: toggleCol(s.dashCustom, k, 3) })}>
              {NUTRIENTS[k].short}
            </Chip>
          ))}
        </div>
      </Card>

      <div class="section-t">Exercise</div>
      <div class="card flush">
        <SwitchRow label="Add exercise calories to my goal" sub="Eat back what you burn" k="exerciseCalories" />
        <SwitchRow label="Count steps as exercise" sub="Adds roughly 0.04 calories per step" k="stepCalories" />
      </div>

      <div class="section-t">Reminders</div>
      <div class="card flush">
        {s.reminders.map((r) => (
          <div key={r.id} class="listrow">
            <span class="grow">
              <span class="row-t">{r.label}</span>
            </span>
            <input class="input" type="time" value={r.time} style={{ width: '7.5rem' }} onChange={(e) => saveSettings({ reminders: s.reminders.map((x) => (x.id === r.id ? { ...x, time: (e.currentTarget as HTMLInputElement).value } : x)) })} />
            <Switch
              label={r.label}
              on={r.on}
              onChange={async (on) => {
                if (on && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
                saveSettings({ reminders: s.reminders.map((x) => (x.id === r.id ? { ...x, on } : x)) })
              }}
            />
          </div>
        ))}
        <div style={{ padding: '0.75rem 1rem' }}>
          <p class="small muted" style={{ marginTop: 0 }}>
            Notifications show while Forkful is open or recently used. For reminders that always ring, add them to your phone's calendar.
          </p>
          <div class="row wrap gap-s">
            <button class="btn sm soft" disabled={!s.reminders.some((r) => r.on)} onClick={() => deliver('forkful-reminders.ics', new Blob([remindersIcs()], { type: 'text/calendar' }))}>
              <Icon name="calendar" size={0.9} /> Add to calendar
            </button>
            <button
              class="btn sm ghost"
              onClick={async () => {
                if ('Notification' in window && Notification.permission !== 'granted') await Notification.requestPermission()
                if (!(await notify('Forkful', 'Reminders are working.'))) say('Notifications are blocked for this app')
              }}
            >
              Test notification
            </button>
          </div>
        </div>
      </div>

      <div class="section-t">Your data</div>
      <Card title="Export">
        <div class="chips mb" style={{ marginBottom: '0.75rem' }}>
          {[
            [7, '7 days'],
            [30, '30 days'],
            [90, '90 days'],
            [365, '1 year'],
            [0, 'Everything'],
          ].map(([v, l]) => (
            <Chip key={v} on={range === v} onClick={() => setRange(v as number)}>
              {l}
            </Chip>
          ))}
        </div>
        <div class="grid2" style={{ gap: '0.5rem' }}>
          <button class="btn outline sm" onClick={() => deliver(`forkful-diary-${to}.csv`, new Blob([diaryCsv(from, to)], { type: 'text/csv' }))}>
            Food diary
          </button>
          <button class="btn outline sm" onClick={() => deliver(`forkful-nutrition-${to}.csv`, new Blob([summaryCsv(from, to)], { type: 'text/csv' }))}>
            Nutrition summary
          </button>
          <button class="btn outline sm" onClick={() => deliver(`forkful-exercise-${to}.csv`, new Blob([exerciseCsv(from, to)], { type: 'text/csv' }))}>
            Exercise
          </button>
          <button class="btn outline sm" onClick={() => deliver(`forkful-measurements-${to}.csv`, new Blob([measurementCsv()], { type: 'text/csv' }))}>
            Weight and body
          </button>
        </div>
      </Card>
      <Card title="Backup">
        <p class="small muted" style={{ marginTop: 0 }}>
          Everything lives on this phone only. Save a backup now and then, and before you clear the browser or switch phones.
        </p>
        <div class="grid2" style={{ gap: '0.5rem' }}>
          <button
            class="btn primary sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await deliver(`forkful-backup-${today()}.json`, await backupJson())
              setBusy(false)
            }}
          >
            <Icon name="download" size={0.9} /> Save backup
          </button>
          <button
            class="btn outline sm"
            disabled={busy}
            onClick={async () => {
              if (!(await confirmBox('Restore a backup?', 'This replaces everything currently in the app.', 'Choose file', true))) return
              readFile('.json,application/json', async (t) => {
                await restoreJson(t)
                say('Backup restored')
              })
            }}
          >
            <Icon name="upload" size={0.9} /> Restore
          </button>
        </div>
      </Card>
      <Card title="Import from MyFitnessPal">
        <p class="small muted" style={{ marginTop: 0 }}>
          Request your export in MyFitnessPal (Settings, Export data), unzip it, then import the Nutrition, Exercise and Measurement CSV files one by one. Meals come in as daily totals per meal.
        </p>
        <button
          class="btn outline sm block"
          disabled={busy}
          onClick={() =>
            readFile('.csv,text/csv', async (t) => {
              const r = await importCsv(t)
              say(`Imported ${r.meals} meals, ${r.exercises} exercises, ${r.weights} weigh-ins`)
            })
          }
        >
          <Icon name="upload" size={0.9} /> Import a CSV file
        </button>
      </Card>
      <button
        class="btn ghost danger block"
        onClick={async () => {
          if (!(await confirmBox('Delete all data?', 'Your diary, foods, recipes, weigh-ins, photos and goals will be erased from this phone. This cannot be undone.', 'Delete everything', true))) return
          const really = await promptBox('Type DELETE to confirm', '', 'Delete')
          if (really?.trim().toUpperCase() !== 'DELETE') return
          await wipeAll()
          location.hash = '/'
        }}
      >
        <Icon name="trash" size={1} /> Delete all data
      </button>

      <div class="section-t">About</div>
      <Card>
        <p class="small" style={{ marginTop: 0 }}>
          <b>Forkful</b> is a private food diary. No account, no ads, no tracking. Your data never leaves this device unless you export it.
        </p>
        <p class="tiny muted">
          Food data: {dbSource()}. Brand and barcode data from Open Food Facts (openfoodfacts.org), available under the Open Database License. Exercise estimates use MET values from the Compendium of Physical Activities. Calorie needs use the Mifflin-St Jeor equation.
        </p>
      </Card>
    </Page>
  )
}
