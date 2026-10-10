import { useEffect } from 'preact/hooks'
import { Icon, Logo } from './components/Icon'
import { QuickAddSheet, StepsSheet, WaterSheet, WeightSheet } from './components/Sheets'
import { AccountSheet } from './components/Account'
import { AskHost, Menu } from './components/ui'
import { today } from './lib/dates'
import { go, route } from './lib/router'
import { activeFast, diaryDay, profile, ready, settings, toast } from './lib/store'
import { openSheet, sheet } from './lib/uiState'
import { AddExercise } from './views/AddExercise'
import { AddFood } from './views/AddFood'
import { CreateFood } from './views/CreateFood'
import { Dashboard } from './views/Dashboard'
import { Diary } from './views/Diary'
import { Fasting } from './views/Fasting'
import { GoalsView } from './views/Goals'
import { Grocery } from './views/Grocery'
import { MealEditor } from './views/MealEditor'
import { More } from './views/More'
import { MyItems } from './views/MyItems'
import { NutritionView } from './views/Nutrition'
import { Onboarding } from './views/Onboarding'
import { ProgressView } from './views/Progress'
import { RecipeEditor } from './views/RecipeEditor'
import { Reports } from './views/Reports'
import { SettingsView } from './views/Settings'

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'home', match: (p: string) => p === '/' },
  { href: '/diary', label: 'Diary', icon: 'book', match: (p: string) => p.startsWith('/diary') || p.startsWith('/add') || p.startsWith('/nutrition') || p.startsWith('/exercise') },
  null,
  { href: '/progress', label: 'Progress', icon: 'chart', match: (p: string) => p.startsWith('/progress') || p.startsWith('/reports') },
  { href: '/more', label: 'More', icon: 'menu', match: (p: string) => !['/', '/diary', '/progress'].includes(p) && !/^\/(diary|add|nutrition|exercise|progress|reports)/.test(p) },
]

function applyTheme() {
  const t = settings.value.theme
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c100d' : '#f3f5f2')
}

export function App() {
  const { path, parts, query } = route.value
  useEffect(applyTheme, [settings.value.theme])

  if (!ready.value)
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
        <div class="brand">
          <Logo size={2} /> Forkful
        </div>
      </div>
    )

  if (!profile.value)
    return (
      <>
        <Onboarding />
        <AccountSheet />
        <AskHost />
      </>
    )

  const day = query.get('day') || diaryDay.value || today()
  const meal = Number(query.get('meal') ?? 0)

  let view
  let nav = true
  switch (parts[0]) {
    case 'diary':
      view = <Diary />
      break
    case 'add':
      view = <AddFood day={day} meal={meal} tab={(query.get('tab') as 'all') || 'all'} scan={query.get('scan') === '1'} voice={query.get('voice') === '1'} />
      nav = false
      break
    case 'exercise':
      view = <AddExercise day={day} />
      nav = false
      break
    case 'food':
      view = <CreateFood id={parts[1] === 'new' ? null : parts[1]} barcode={query.get('barcode') ?? undefined} />
      nav = false
      break
    case 'recipe':
      view = <RecipeEditor id={parts[1] === 'new' ? null : parts[1]} />
      nav = false
      break
    case 'meal':
      view = <MealEditor id={parts[1] === 'new' ? null : parts[1]} />
      nav = false
      break
    case 'mine':
      view = <MyItems tab={(parts[1] as 'foods') || 'foods'} />
      break
    case 'nutrition':
      view = <NutritionView day={day} />
      break
    case 'progress':
      view = <ProgressView />
      break
    case 'reports':
      view = <Reports />
      break
    case 'goals':
      view = <GoalsView />
      break
    case 'settings':
      view = <SettingsView />
      break
    case 'fasting':
      view = <Fasting />
      break
    case 'grocery':
      view = <Grocery />
      break
    case 'more':
      view = <More />
      break
    default:
      view = <Dashboard />
  }

  const s = sheet.value
  const close = () => (sheet.value = null)
  const d = diaryDay.value

  return (
    <div class="shell">
      <main class="main">{view}</main>
      {nav && (
        <nav class="bottomnav" aria-label="Main">
          <div class="bottomnav-in">
            {NAV.map((n, i) =>
              n ? (
                <a key={n.href} href={`#${n.href}`} class={`navitem ${n.match(path) ? 'active' : ''}`}>
                  <Icon name={n.icon} size={1.35} />
                  {n.label}
                </a>
              ) : (
                <button key={i} class={`navplus ${s?.kind === 'plus' ? 'open' : ''}`} aria-label="Log something" onClick={() => (s?.kind === 'plus' ? close() : openSheet('plus', d))}>
                  <Icon name="plus" size={1.6} stroke={2.6} />
                </button>
              ),
            )}
          </div>
        </nav>
      )}
      {s?.kind === 'plus' && (
        <Menu
          title={`Log for ${d === today() ? 'today' : d}`}
          onClose={close}
          items={[
            { icon: 'search', label: 'Log food', fn: () => go(`/add?day=${d}&meal=${guessMeal()}`) },
            { icon: 'scan', label: 'Scan a barcode', fn: () => go(`/add?day=${d}&meal=${guessMeal()}&scan=1`) },
            { icon: 'mic', label: 'Voice log', fn: () => go(`/add?day=${d}&meal=${guessMeal()}&voice=1`) },
            { icon: 'zap', label: 'Quick add calories', fn: () => openSheet('quick', d, guessMeal()) },
            { icon: 'drop', label: 'Water', fn: () => openSheet('water', d) },
            { icon: 'dumbbell', label: 'Exercise', fn: () => go(`/exercise?day=${d}`) },
            { icon: 'scale', label: 'Weight', fn: () => openSheet('weight', d) },
            { icon: 'steps', label: 'Steps', fn: () => openSheet('steps', d) },
            { icon: 'timer', label: activeFast.value ? 'Fasting timer' : 'Start a fast', fn: () => go('/fasting') },
          ]}
        />
      )}
      {s?.kind === 'quick' && <QuickAddSheet day={s.day} meal={s.meal} onClose={close} />}
      {s?.kind === 'water' && <WaterSheet day={s.day} onClose={close} />}
      {s?.kind === 'weight' && <WeightSheet onClose={close} />}
      {s?.kind === 'steps' && <StepsSheet day={s.day} onClose={close} />}
      <AccountSheet />
      <AskHost />
      {toast.value && (
        <div class="toast" key={toast.value.id} role="status">
          <span>{toast.value.text}</span>
          {toast.value.action && (
            <button
              onClick={() => {
                toast.value?.action?.fn()
                toast.value = null
              }}
            >
              {toast.value.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Pick the meal that fits the time of day. */
export function guessMeal(): number {
  const h = new Date().getHours()
  const n = settings.value.meals.length
  if (h < 11) return 0
  if (h < 15) return Math.min(1, n - 1)
  if (h < 17) return n - 1
  if (h < 21) return Math.min(2, n - 1)
  return n - 1
}
