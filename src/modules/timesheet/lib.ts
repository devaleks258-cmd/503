import type { HkLine, HkShift } from '@/lib/database.types'
import type { Lang } from '@/i18n'

const TZ = 'Africa/Cairo'

// ── даты (всё в формате YYYY-MM-DD, арифметика в UTC, без сдвигов часовых поясов) ──
export function todayCairo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function mondayOf(iso: string): string {
  const dow = (toUtc(iso).getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

// ── время ──
export function hhmm(t: string): string {
  return t.slice(0, 5)
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}

/** Длительность смены в минутах; конец раньше начала = смена через полночь. */
export function minutesBetween(start: string, end: string): number {
  return (toMinutes(end) - toMinutes(start) + 1440) % 1440
}

// ── форматирование ──
export function localeFor(lang: Lang): string {
  return lang === 'ar' ? 'ar-EG' : lang === 'en' ? 'en-GB' : 'ru-RU'
}

export function fmtNum(v: number, lang: Lang, maxFrac = 1): string {
  return new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: maxFrac }).format(v)
}

export function fmtMoney(v: number, lang: Lang): string {
  return `${fmtNum(v, lang, 2)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`
}

export function fmtDayMonth(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeFor(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toUtc(iso))
}

export function fmtCairoDayMonth(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeFor(lang), { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso))
}

export function fmtLongDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeFor(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(toUtc(iso))
}

export function fmtWeekRange(weekStart: string, lang: Lang): string {
  const end = addDays(weekStart, 6)
  const year = new Intl.DateTimeFormat(localeFor(lang), { year: 'numeric', timeZone: 'UTC' }).format(toUtc(end))
  return `${fmtDayMonth(weekStart, lang)} – ${fmtDayMonth(end, lang)} ${year}`
}

export function fmtDuration(minutes: number, lang: Lang, h: string, m: string): string {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  const nf = (x: number) => fmtNum(x, lang, 0)
  if (mm === 0) return `${nf(hh)} ${h}`
  if (hh === 0) return `${nf(mm)} ${m}`
  return `${nf(hh)} ${h} ${nf(mm)} ${m}`
}

// ── итоги ──
export interface Totals {
  days: number
  hours: number
  apartments: number
  bonus: number
}

export function totalsFor(staffId: number, shifts: HkShift[], lines: HkLine[]): Totals {
  const t: Totals = { days: 0, hours: 0, apartments: 0, bonus: 0 }
  for (const s of shifts) {
    if (s.staff_id !== staffId) continue
    t.days += 1
    t.hours += Number(s.hours)
  }
  for (const l of lines) {
    if (l.staff_id !== staffId) continue
    t.apartments += Number(l.share)
    t.bonus += Number(l.bonus)
  }
  return t
}

export function sumTotals(list: Totals[]): Totals {
  return list.reduce<Totals>(
    (acc, x) => ({
      days: acc.days + x.days,
      hours: acc.hours + x.hours,
      apartments: acc.apartments + x.apartments,
      bonus: acc.bonus + x.bonus,
    }),
    { days: 0, hours: 0, apartments: 0, bonus: 0 },
  )
}

// ── CSV (UTF-8 с BOM, чтобы Excel не ломал кириллицу и арабский) ──
export function csvNum(v: number, lang: Lang): string {
  const s = String(Math.round(v * 100) / 100)
  return lang === 'ru' ? s.replace('.', ',') : s
}

export function toCsv(rows: string[][], lang: Lang): string {
  const sep = lang === 'ru' ? ';' : ','
  const esc = (v: string) => (v.includes(sep) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '\uFEFF' + rows.map((r) => r.map(esc).join(sep)).join('\r\n')
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
