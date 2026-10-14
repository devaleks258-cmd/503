import { supabase } from '@/lib/supabase'

export type AptType = 'studio' | '1br' | '2br'

export interface HkStaff {
  id: number
  full_name: string
}

export interface WorkDay {
  id: string
  staff_id: number
  work_date: string
  open_time: string
  close_time: string
  note: string | null
}

export interface WorkLine {
  id: string
  work_day_id: string
  apartment_id: number | null
  apt_type: AptType | null
  sort_order: number
}

export interface Bonus {
  id: string
  staff_id: number
  week_start: string
  amount: number
  note: string | null
}

export interface NormHour {
  apt_type: AptType
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
  const { data, error } = await supabase.rpc('hk_week_report', { p_week_start: weekStart })
  if (error) throw error
  return (data ?? []) as WeekRow[]
}

export async function fetchWorkDays(weekStart: string): Promise<WorkDay[]> {
  const end = toIso(addDays(parseIso(weekStart), 7))
  const { data, error } = await supabase
    .from('hk_work_days')
    .select('id, staff_id, work_date, open_time, close_time, note')
    .gte('work_date', weekStart)
    .lt('work_date', end)
    .order('work_date')
  if (error) throw error
  return (data ?? []) as WorkDay[]
}

export async function saveWorkDay(wd: Partial<WorkDay> & { staff_id: number; work_date: string; open_time: string; close_time: string }): Promise<WorkDay> {
  const { id, ...rest } = wd
  if (id) {
    const { data, error } = await supabase
      .from('hk_work_days')
      .update(rest)
      .eq('id', id)
      .select('id, staff_id, work_date, open_time, close_time, note')
      .single()
    if (error) throw error
    return data as WorkDay
  }
  const { data, error } = await supabase
    .from('hk_work_days')
    .upsert(rest, { onConflict: 'staff_id,work_date' })
    .select('id, staff_id, work_date, open_time, close_time, note')
    .single()
  if (error) throw error
  return data as WorkDay
}

export async function deleteWorkDay(id: string): Promise<void> {
  const { error } = await supabase.from('hk_work_days').delete().eq('id', id)
  if (error) throw error
}

export async function fetchWorkLines(workDayIds: string[]): Promise<WorkLine[]> {
  if (workDayIds.length === 0) return []
  const { data, error } = await supabase
    .from('hk_work_lines')
    .select('id, work_day_id, apartment_id, apt_type, sort_order')
    .in('work_day_id', workDayIds)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as WorkLine[]
}

export async function syncWorkLines(workDayId: string, apts: { apartment_id: number; apt_type: AptType }[]): Promise<void> {
  const { error: delErr } = await supabase.from('hk_work_lines').delete().eq('work_day_id', workDayId)
  if (delErr) throw delErr
  if (apts.length > 0) {
    const { error: insErr } = await supabase.from('hk_work_lines').insert(
      apts.map((a, i) => ({ work_day_id: workDayId, apartment_id: a.apartment_id, apt_type: a.apt_type, sort_order: i }))
    )
    if (insErr) throw insErr
  }
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
    const { data, error } = await supabase.from('hk_bonuses').update(rest).eq('id', id)
      .select('id, staff_id, week_start, amount, note').single()
    if (error) throw error
    return data as Bonus
  }
  const { data, error } = await supabase.from('hk_bonuses').insert(rest)
    .select('id, staff_id, week_start, amount, note').single()
  if (error) throw error
  return data as Bonus
}

export async function fetchNormHours(): Promise<NormHour[]> {
  const { data, error } = await supabase.from('hk_norm_hours').select('apt_type, hours').order('apt_type')
  if (error) throw error
  return (data ?? []) as NormHour[]
}

export async function saveNormHour(apt_type: AptType, hours: number): Promise<void> {
  const { error } = await supabase.from('hk_norm_hours').upsert({ apt_type, hours })
  if (error) throw error
}
