import type { Nutr } from './nutrients'

/** Local calendar day, 'YYYY-MM-DD'. */
export type Day = string

/** One way to measure a food. 1 of this unit equals `f` base servings of the food's `n`. */
export interface Unit {
  label: string
  f: number
  /** Grams in one of this unit, when known. */
  g?: number
}

export type FoodSource = 'usda' | 'off' | 'custom' | 'recipe' | 'quick' | 'ai'

export interface Food {
  id: string
  name: string
  brand?: string
  source: FoodSource
  /** Nutrients for one base serving (100 g for database foods, one serving for custom foods and recipes). */
  n: Nutr
  units: Unit[]
  barcode?: string
  cat?: string
  img?: string
  /** Custom foods only: how the label was entered, so it can be edited again. */
  form?: { label: string; grams?: number; per100: boolean }
  created?: number
  updated?: number
}

export interface Entry {
  id: string
  day: Day
  meal: number
  food: Food
  qty: number
  unit: number
  /** When it was eaten (ms). Used for food timestamps. */
  time: number
  order: number
}

export interface Exercise {
  id: string
  day: Day
  kind: 'cardio' | 'strength'
  name: string
  minutes?: number
  kcal: number
  sets?: number
  reps?: number
  /** kg per rep */
  weight?: number
  met?: number
  note?: string
  time: number
}

export interface DayLog {
  day: Day
  /** ml */
  water?: number
  steps?: number
  foodNote?: string
  exerciseNote?: string
  completed?: boolean
}

export type MeasureKey = 'weight' | 'bodyFat' | 'waist' | 'hips' | 'chest' | 'neck' | 'arm' | 'thigh'

export interface Measurement {
  id: string
  day: Day
  key: MeasureKey
  /** kg, %, or cm */
  value: number
}

export interface Photo {
  id: string
  day: Day
  blob: Blob
  note?: string
}

export interface Item {
  food: Food
  qty: number
  unit: number
}

export interface SavedMeal {
  id: string
  name: string
  items: Item[]
  created: number
}

export interface Recipe {
  id: string
  name: string
  servings: number
  items: Item[]
  note?: string
  url?: string
  created: number
  updated: number
}

export interface Fast {
  id: string
  start: number
  end?: number
  /** target hours */
  target: number
}

export interface CustomExercise {
  id: string
  name: string
  kind: 'cardio' | 'strength'
  /** kcal per minute for cardio */
  kcalPerMin?: number
}

export type Sex = 'male' | 'female'
export type Activity = 'sedentary' | 'light' | 'active' | 'very'
export type GoalType = 'lose' | 'maintain' | 'gain'

export interface Profile {
  name?: string
  sex: Sex
  birth: string
  /** cm */
  height: number
  /** kg, at the start of the plan */
  startWeight: number
  startDay: Day
  /** kg */
  goalWeight: number
  /** kg per week, positive number; direction from goalType */
  rate: number
  goalType: GoalType
  activity: Activity
}

export interface Goals {
  /** null means calculated from the profile */
  kcal: number | null
  /** Optional per weekday (0 = Sunday) calorie overrides. */
  byDay?: (number | null)[] | null
  /** macro split as shares of calories */
  carbs: number
  protein: number
  fat: number
  /** grams mode stores explicit grams instead of shares */
  macroMode: 'pct' | 'grams'
  grams?: { carbs: number; protein: number; fat: number }
  /** per-nutrient custom daily goals; missing ones fall back to daily values */
  nutrients: Partial<Record<string, number>>
  /** ml */
  water: number
  workoutsPerWeek: number
  minutesPerWorkout: number
  exerciseKcalPerWeek: number
  steps: number
}

export interface Settings {
  weightUnit: 'kg' | 'lb' | 'st'
  heightUnit: 'cm' | 'ftin'
  energyUnit: 'kcal' | 'kJ'
  waterUnit: 'ml' | 'floz' | 'cup'
  lengthUnit: 'cm' | 'in'
  theme: 'system' | 'light' | 'dark'
  meals: string[]
  /** add exercise calories back to the daily goal */
  exerciseCalories: boolean
  /** count steps as exercise calories */
  stepCalories: boolean
  netCarbs: boolean
  timestamps: boolean
  weekStart: 0 | 1
  /** nutrients shown in the diary footer and per meal (besides calories) */
  diaryCols: string[]
  /** nutrients on the custom dashboard card */
  dashCustom: string[]
  mealMacros: boolean
  reminders: { id: string; label: string; time: string; on: boolean }[]
  fastPreset: number
}
