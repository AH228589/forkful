import { signal } from '@preact/signals'
import type { Day } from './types'

export type SheetKind = 'plus' | 'quick' | 'water' | 'weight' | 'steps'
export const sheet = signal<{ kind: SheetKind; day: Day; meal: number } | null>(null)

export function openSheet(kind: SheetKind, day: Day, meal = 0) {
  sheet.value = { kind, day, meal }
}
