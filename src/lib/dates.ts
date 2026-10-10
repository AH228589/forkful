import type { Day } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(d: Date = new Date()): Day {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function today(): Day {
  return dayKey()
}

export function addDays(day: Day, n: number): Day {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

export function diffDays(a: Day, b: Day): number {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000)
}

export function range(from: Day, to: Day): Day[] {
  const out: Day[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function weekStartOf(day: Day, weekStart: 0 | 1): Day {
  const d = parseDay(day)
  const wd = d.getDay()
  const back = (wd - weekStart + 7) % 7
  return addDays(day, -back)
}

export function fmtDay(day: Day, style: 'long' | 'short' | 'tiny' = 'long'): string {
  const t = today()
  if (day === t) return 'Today'
  if (day === addDays(t, -1)) return 'Yesterday'
  if (day === addDays(t, 1)) return 'Tomorrow'
  const d = parseDay(day)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  if (style === 'tiny') return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  if (style === 'short') return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function fmtShort(day: Day): string {
  return parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function weekdayShort(day: Day): string {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'narrow' })
}

export function ageFrom(birth: string, on: Date = new Date()): number {
  const b = new Date(birth)
  let a = on.getFullYear() - b.getFullYear()
  const m = on.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) a--
  return a
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${pad(m)}:${pad(sec)}`
}

/** Merge a day with a clock time (HH:MM) into ms. */
export function atTime(day: Day, hhmm: string): number {
  const d = parseDay(day)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.getTime()
}

export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
