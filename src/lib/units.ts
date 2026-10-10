import { settings } from './store'

const LB = 2.2046226218
const KJ = 4.184
const FLOZ = 29.5735
const CUP = 236.588

const r1 = (v: number) => Math.round(v * 10) / 10

// ---- weight (kg internally) ----
export function wUnit(): string {
  const u = settings.value.weightUnit
  return u === 'st' ? 'st' : u
}

/** kg -> number in the display unit (stones as decimals). */
export function wTo(kg: number): number {
  const u = settings.value.weightUnit
  if (u === 'lb') return kg * LB
  if (u === 'st') return (kg * LB) / 14
  return kg
}

export function wFrom(v: number): number {
  const u = settings.value.weightUnit
  if (u === 'lb') return v / LB
  if (u === 'st') return (v * 14) / LB
  return v
}

export function fmtW(kg: number | undefined, unit = true): string {
  if (kg == null || Number.isNaN(kg)) return '-'
  const u = settings.value.weightUnit
  if (u === 'st') {
    const lbs = kg * LB
    const st = Math.floor(lbs / 14)
    const rest = r1(lbs - st * 14)
    return `${st} st ${rest} lb`
  }
  return `${r1(wTo(kg))}${unit ? ` ${u}` : ''}`
}

/** Weight input field works in lb for stone users so it stays a single number. */
export function wInputUnit(): 'kg' | 'lb' {
  return settings.value.weightUnit === 'kg' ? 'kg' : 'lb'
}
export const wInTo = (kg: number) => (wInputUnit() === 'kg' ? kg : kg * LB)
export const wInFrom = (v: number) => (wInputUnit() === 'kg' ? v : v / LB)

// ---- small weights (kg lifted) ----
export const liftUnit = () => (settings.value.weightUnit === 'kg' ? 'kg' : 'lb')
export const liftTo = (kg: number) => (liftUnit() === 'kg' ? kg : kg * LB)
export const liftFrom = (v: number) => (liftUnit() === 'kg' ? v : v / LB)

// ---- height / length (cm internally) ----
export function fmtH(cm: number): string {
  if (settings.value.heightUnit === 'ftin') {
    const inches = cm / 2.54
    const ft = Math.floor(inches / 12)
    const inch = Math.round(inches - ft * 12)
    return inch === 12 ? `${ft + 1}' 0"` : `${ft}' ${inch}"`
  }
  return `${Math.round(cm)} cm`
}

export const lenUnit = () => settings.value.lengthUnit
export const lenTo = (cm: number) => (lenUnit() === 'cm' ? cm : cm / 2.54)
export const lenFrom = (v: number) => (lenUnit() === 'cm' ? v : v * 2.54)
export const fmtLen = (cm: number) => `${r1(lenTo(cm))} ${lenUnit()}`

// ---- energy (kcal internally) ----
export const eUnit = () => (settings.value.energyUnit === 'kJ' ? 'kJ' : 'Cal')
export const eTo = (kcal: number) => (settings.value.energyUnit === 'kJ' ? kcal * KJ : kcal)
export const eFrom = (v: number) => (settings.value.energyUnit === 'kJ' ? v / KJ : v)
export function fmtE(kcal: number | undefined): string {
  if (kcal == null || Number.isNaN(kcal)) return '-'
  return Math.round(eTo(kcal)).toLocaleString()
}

// ---- water (ml internally) ----
export function waterUnit(): string {
  const u = settings.value.waterUnit
  return u === 'floz' ? 'fl oz' : u === 'cup' ? 'cups' : 'ml'
}
export function waterTo(ml: number): number {
  const u = settings.value.waterUnit
  return u === 'floz' ? ml / FLOZ : u === 'cup' ? ml / CUP : ml
}
export function waterFrom(v: number): number {
  const u = settings.value.waterUnit
  return u === 'floz' ? v * FLOZ : u === 'cup' ? v * CUP : v
}
export function fmtWater(ml: number): string {
  const v = waterTo(ml)
  const u = settings.value.waterUnit
  return `${u === 'ml' ? Math.round(v).toLocaleString() : r1(v)} ${waterUnit()}`
}
/** The quick-add steps shown on water buttons, in ml. */
export function waterSteps(): number[] {
  const u = settings.value.waterUnit
  if (u === 'cup') return [CUP, CUP * 2, CUP * 0.5]
  if (u === 'floz') return [FLOZ * 8, FLOZ * 16, FLOZ * 4]
  return [250, 500, 100]
}

export const CONSTANTS = { LB, KJ, FLOZ, CUP }
