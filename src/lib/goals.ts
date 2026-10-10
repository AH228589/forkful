import { computed } from '@preact/signals'
import { ageFrom, parseDay } from './dates'
import { stepKcal } from './exercises'
import { itemNutr } from './foods'
import { NUTRIENTS, add, type Nutr, type NutrientKey } from './nutrients'
import { currentWeight, dayLog, entriesByDay, exercisesByDay, goals, profile, settings } from './store'
import type { Activity, Day, Profile } from './types'

export const ACTIVITY: Record<Activity, { label: string; desc: string; k: number }> = {
  sedentary: { label: 'Not very active', desc: 'Mostly sitting (desk job, little walking).', k: 1.2 },
  light: { label: 'Lightly active', desc: 'On your feet a good part of the day (teacher, retail).', k: 1.375 },
  active: { label: 'Active', desc: 'Physically active most of the day (waiter, courier).', k: 1.55 },
  very: { label: 'Very active', desc: 'Heavy physical work most of the day (builder, farm work).', k: 1.725 },
}

export const KCAL_PER_KG = 7700

/** Mifflin-St Jeor resting energy. */
export function bmr(p: Profile, kg: number): number {
  const age = ageFrom(p.birth)
  return 10 * kg + 6.25 * p.height - 5 * age + (p.sex === 'male' ? 5 : -161)
}

export function maintenance(p: Profile, kg: number): number {
  return bmr(p, kg) * ACTIVITY[p.activity].k
}

export function calcGoal(p: Profile, kg: number): { kcal: number; floored: boolean } {
  const m = maintenance(p, kg)
  const delta = p.goalType === 'maintain' ? 0 : ((p.goalType === 'lose' ? -1 : 1) * p.rate * KCAL_PER_KG) / 7
  const raw = m + delta
  const floor = p.sex === 'male' ? 1500 : 1200
  const kcal = Math.round(Math.max(raw, floor) / 10) * 10
  return { kcal, floored: raw < floor }
}

export const autoKcal = computed(() => (profile.value ? calcGoal(profile.value, currentWeight.value).kcal : 2000))

export function kcalGoal(day?: Day): number {
  const g = goals.value
  if (day && g.byDay) {
    const v = g.byDay[parseDay(day).getDay()]
    if (v != null) return v
  }
  return g.kcal ?? autoKcal.value
}

export function macroGrams(kcal: number) {
  const g = goals.value
  if (g.macroMode === 'grams' && g.grams) return g.grams
  return { carbs: (kcal * g.carbs) / 4, protein: (kcal * g.protein) / 4, fat: (kcal * g.fat) / 9 }
}

/** Daily goal for any nutrient. */
export function nutrientGoal(key: NutrientKey | 'netCarbs', day?: Day): number {
  const kcal = kcalGoal(day)
  if (key === 'kcal') return kcal
  const m = macroGrams(kcal)
  if (key === 'carbs' || key === 'netCarbs') return m.carbs
  if (key === 'protein') return m.protein
  if (key === 'fat') return m.fat
  const custom = goals.value.nutrients[key]
  if (custom != null) return custom
  const info = NUTRIENTS[key]
  if (!info.dv) return 0
  // scale fat-type limits to the calorie goal the way nutrition labels do
  if (key === 'satFat') return Math.round((kcal * 0.1) / 9)
  if (key === 'sugar') return Math.round((kcal * 0.1) / 4)
  if (key === 'fiber') return Math.round((kcal / 1000) * 14)
  return info.dv
}

// ---------- daily totals ----------
export function foodTotals(day: Day, meal?: number): Nutr {
  let t: Nutr = {}
  for (const e of entriesByDay.value.get(day) ?? []) {
    if (meal != null && e.meal !== meal) continue
    t = add(t, itemNutr(e))
  }
  return t
}

export function exerciseKcal(day: Day): number {
  let k = 0
  for (const x of exercisesByDay.value.get(day) ?? []) k += x.kcal
  if (settings.value.stepCalories) {
    const steps = dayLog(day).steps ?? 0
    k += stepKcal(steps, currentWeight.value)
  }
  return k
}

export function exerciseMinutes(day: Day): number {
  let m = 0
  for (const x of exercisesByDay.value.get(day) ?? []) m += x.minutes ?? 0
  return m
}

export function daySummary(day: Day) {
  const food = foodTotals(day)
  const exercise = exerciseKcal(day)
  const goal = kcalGoal(day)
  const counted = settings.value.exerciseCalories ? exercise : 0
  const eaten = food.kcal ?? 0
  return { food, eaten, exercise, counted, goal, remaining: goal - eaten + counted, net: eaten - exercise }
}

/** Value shown for a nutrient column, honouring the net carbs setting. */
export function colValue(n: Nutr, key: string): number {
  if (key === 'carbs' && settings.value.netCarbs) return Math.max(0, (n.carbs ?? 0) - (n.fiber ?? 0))
  return n[key as NutrientKey] ?? 0
}

export function colLabel(key: string): string {
  if (key === 'carbs' && settings.value.netCarbs) return 'Net carbs'
  return NUTRIENTS[key as NutrientKey]?.short ?? key
}

export function colUnit(key: string): string {
  return NUTRIENTS[key as NutrientKey]?.unit ?? ''
}

/** "If every day were like today" projection in kg after 5 weeks. */
export function projection(day: Day): number | null {
  const p = profile.value
  if (!p) return null
  const { eaten, exercise } = daySummary(day)
  if (!eaten) return null
  const kg = currentWeight.value
  const burnt = maintenance(p, kg) + exercise
  return kg - ((burnt - eaten) * 35) / KCAL_PER_KG
}
