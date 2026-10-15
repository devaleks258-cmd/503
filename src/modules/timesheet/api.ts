import { supabase } from '@/lib/supabase'
import type { HkApartment, HkClosure, HkLine, HkShift, HkStaff } from '@/lib/database.types'
import { addDays } from '@/modules/timesheet/lib'

export interface Refs {
  staff: HkStaff[]
  apartments: HkApartment[]
}

export interface WeekData {
  shifts: HkShift[]
  lines: HkLine[]
  closure: HkClosure | null
}

export interface ShiftInput {
  staffId: number
  date: string
  start: string
  end: string
  note: string | null
  apartments: Array<{ apartment_id: number; bonus: number }>
}

export async function fetchRefs(): Promise<Refs> {
  const [staff, apartments] = await Promise.all([
    supabase.from('sv_hk_staff').select('id,full_name,active').order('full_name'),
    supabase.from('sv_hk_apartments').select('id,code,building,type,status').order('code'),
  ])
  if (staff.error) throw new Error(staff.error.message)
  if (apartments.error) throw new Error(apartments.error.message)
  return { staff: (staff.data ?? []) as HkStaff[], apartments: (apartments.data ?? []) as HkApartment[] }
}

export async function fetchWeek(weekStart: string): Promise<WeekData> {
  const weekEnd = addDays(weekStart, 6)
  const [shifts, lines, closure] = await Promise.all([
    supabase
      .from('sv_hk_shifts')
      .select('id,staff_id,work_date,start_time,end_time,note,hours')
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .order('work_date'),
    supabase
      .from('sv_hk_lines')
      .select('shift_id,staff_id,work_date,apartment_id,bonus,share,cleaners')
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd),
    supabase.from('sv_hk_closures').select('week_start,closed_at').eq('week_start', weekStart).maybeSingle(),
  ])
  if (shifts.error) throw new Error(shifts.error.message)
  if (lines.error) throw new Error(lines.error.message)
  if (closure.error) throw new Error(closure.error.message)
  return {
    shifts: (shifts.data ?? []) as HkShift[],
    lines: (lines.data ?? []) as HkLine[],
    closure: (closure.data ?? null) as HkClosure | null,
  }
}

export async function saveShift(input: ShiftInput): Promise<void> {
  const { error } = await supabase.rpc('hk_save_shift', {
    p_staff_id: input.staffId,
    p_date: input.date,
    p_start: input.start,
    p_end: input.end,
    p_apartments: input.apartments,
    p_note: input.note,
  })
  if (error) throw new Error(error.message)
}

export async function deleteShift(staffId: number, date: string): Promise<void> {
  const { error } = await supabase.rpc('hk_delete_shift', { p_staff_id: staffId, p_date: date })
  if (error) throw new Error(error.message)
}

export async function closeWeek(weekStart: string): Promise<void> {
  const { error } = await supabase.rpc('hk_close_week', { p_week: weekStart })
  if (error) throw new Error(error.message)
}

export async function reopenWeek(weekStart: string): Promise<void> {
  const { error } = await supabase.rpc('hk_reopen_week', { p_week: weekStart })
  if (error) throw new Error(error.message)
}
