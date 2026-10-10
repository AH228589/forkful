import { atTime, today } from './dates'
import { entriesByDay, settings, weights } from './store'

const KEY = 'forkful-reminders-fired'

function fired(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function markFired(id: string, day: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...fired(), [id]: day }))
  } catch {
    /* storage blocked */
  }
}

export async function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: title })
    else new Notification(title, { body, icon: '/icon-192.png' })
    return true
  } catch {
    return false
  }
}

/** Skip meal reminders once that meal already has food logged today. */
function alreadyDone(label: string): boolean {
  const t = today()
  const list = entriesByDay.value.get(t) ?? []
  const meals = settings.value.meals.map((m) => m.toLowerCase())
  const lower = label.toLowerCase()
  const idx = meals.findIndex((m) => lower.includes(m.replace(/s$/, '')))
  if (idx >= 0) return list.some((e) => e.meal === idx)
  if (/weigh/.test(lower)) return weights.value.some((w) => w.day === t)
  return false
}

function tick() {
  const t = today()
  const now = Date.now()
  const done = fired()
  for (const r of settings.value.reminders) {
    if (!r.on || done[r.id] === t) continue
    const at = atTime(t, r.time)
    if (now < at || now - at > 45 * 60000) continue
    markFired(r.id, t)
    if (!alreadyDone(r.label)) notify('Forkful', `${r.label}`)
  }
}

let timer = 0
export function startReminders() {
  clearInterval(timer)
  tick()
  timer = window.setInterval(tick, 30000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick())
}

/** Daily repeating calendar events so the phone's calendar app rings even when Forkful is closed. */
export function remindersIcs(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const t = today().replace(/-/g, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Forkful//Reminders//EN', 'CALSCALE:GREGORIAN']
  for (const r of settings.value.reminders.filter((x) => x.on)) {
    const hm = r.time.replace(':', '') + '00'
    lines.push(
      'BEGIN:VEVENT',
      `UID:forkful-${r.id}@forkful`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${t}T${hm}`,
      'DURATION:PT5M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${r.label} (Forkful)`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${r.label}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
