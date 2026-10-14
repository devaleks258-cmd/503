import { supabase } from '@/lib/supabase'

export interface HkStaff {
  id: number
  full_name: string
}

export interface Shift {
  id: string
  staff_id: number
  work_date: string
  start_time: string
  end_time: string
  apartment_id: number | null
  apt_type: 'studio' | '1br' | '2br' | null
  note: string | null
}

export interface Bonus {
  id: string
  staff_id: number
  week_start: string
  amount: number
  note: string | null
}

export interface NormHour {
  apt_type: 'studio' | '1br' | '2br'
  hours: number
}

export interface WeekRow {
  staff_id: number
  full_name: string
  total_hours: number
  norm_hours: number
  bonus: number
  week_start: string
}

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function mondayOf(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function hhmm(time: string): string {
  return time.slice(0, 5)
}

export function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.round(((eh * 60 + em - sh * 60 - sm) / 60) * 100) / 100
}

export async function fetchHousekeepers(): Promise<HkStaff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, full_name')
    .eq('role', 'housekeeper')
    .eq('active', true)
    .order('full_name')
  if (error) throw error
  return data ?? []
}

export async function fetchWeekReport(weekStart: string): Promise<WeekRow[]> {
  const { data, error } = await supabase.rpc('hk_week_report', {
    p_week_start: weekStart,
  })
  if (error) throw error
  return (data ?? []) as WeekRow[]
}

export async function fetchShifts(weekStart: string): Promise<Shift[]> {
  const end = toIso(addDays(parseIso(weekStart), 7))
  const { data, error } = await supabase
    .from('hk_shifts')
    .select('id, staff_id, work_date, start_time, end_time, apartment_id, apt_type, note')
    .gte('work_date', weekStart)
    .lt('work_date', end)
    .order('work_date')
    .order('start_time')
  if (error) throw error
  return (data ?? []) as Shift[]
}

export async function saveShift(shift: Partial<Shift> & { staff_id: number; work_date: string; start_time: string; end_time: string }): Promise<Shift> {
  const { id, ...rest } = shift
  if (id) {
    const { data, error } = await supabase
      .from('hk_shifts')
      .update(rest)
      .eq('id', id)
      .select('id, staff_id, work_date, start_time, end_time, apartment_id, apt_type, note')
      .single()
    if (error) throw error
    return data as Shift
  }
  const { data, error } = await supabase
    .from('hk_shifts')
    .insert(rest)
    .select('id, staff_id, work_date, start_time, end_time, apartment_id, apt_type, note')
    .single()
  if (error) throw error
  return data as Shift
}

export async function deleteShift(id: string): Promise<void> {
  const { error } = await supabase.from('hk_shifts').delete().eq('id', id)
  if (error) throw error
}

export async function fetchBonuses(weekStart: string): Promise<Bonus[]> {
  const { data, error } = await supabase
    .from('hk_bonuses')
    .select('id, staff_id, week_start, amount, note')
    .eq('week_start', weekStart)
  if (error) throw error
  return (data ?? []) as Bonus[]
}

export async function saveBonus(bonus: Partial<Bonus> & { staff_id: number; week_start: string; amount: number }): Promise<Bonus> {
  const { id, ...rest } = bonus
  if (id) {
    const { data, error } = await supabase
      .from('hk_bonuses')
      .update(rest)
      .eq('id', id)
      .select('id, staff_id, week_start, amount, note')
      .single()
    if (error) throw error
    return data as Bonus
  }
  const { data, error } = await supabase
    .from('hk_bonuses')
    .insert(rest)
    .select('id, staff_id, week_start, amount, note')
    .single()
  if (error) throw error
  return data as Bonus
}

export async function fetchNormHours(): Promise<NormHour[]> {
  const { data, error } = await supabase
    .from('hk_norm_hours')
    .select('apt_type, hours')
    .order('apt_type')
  if (error) throw error
  return (data ?? []) as NormHour[]
}

export async function saveNormHour(apt_type: NormHour['apt_type'], hours: number): Promise<void> {
  const { error } = await supabase
    .from('hk_norm_hours')
    .upsert({ apt_type, hours })
  if (error) throw error
}
