import { useEffect, useState, useMemo, useCallback } from 'react'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, X } from 'lucide-react'
import {
  fetchHousekeepers,
  fetchWeekReport,
  fetchShifts,
  saveShift,
  deleteShift,
  fetchBonuses,
  saveBonus,
  fetchNormHours,
  saveNormHour,
  toIso,
  parseIso,
  mondayOf,
  addDays,
  hhmm,
  shiftHours,
  type HkStaff,
  type WeekRow,
  type Shift,
  type Bonus,
  type NormHour,
} from '@/modules/timesheet/api'

const DAYS = [0, 1, 2, 3, 4, 5, 6]
const DAY_KEY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type AptType = 'studio' | '1br' | '2br'

interface Apt {
  id: number
  code: string
  type: AptType
}

const DEFAULT_START = '09:00'
const DEFAULT_END = '17:00'

export function TimesheetPage() {
  const { t, n } = useI18n()
  const [weekStart, setWeekStart] = useState(() => toIso(mondayOf(new Date())))
  const [report, setReport] = useState<WeekRow[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [bonuses, setBonuses] = useState<Bonus[]>([])
  const [housekeepers, setHousekeepers] = useState<HkStaff[]>([])
  const [apartments, setApartments] = useState<Apt[]>([])
  const [normHours, setNormHours] = useState<NormHour[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editingShift, setEditingShift] = useState<(Partial<Shift> & { staff_id: number; work_date: string; start_time: string; end_time: string }) | null>(null)
  const [editingBonus, setEditingBonus] = useState<{ staff_id: number; amount: string; note: string; id?: string } | null>(null)
  const [showNorms, setShowNorms] = useState(false)
  const [normEdits, setNormEdits] = useState<Record<AptType, string>>({ studio: '', '1br': '', '2br': '' })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, s, b, hk, apts, nh] = await Promise.all([
        fetchWeekReport(weekStart),
        fetchShifts(weekStart),
        fetchBonuses(weekStart),
        fetchHousekeepers(),
        fetchApartmentsForTimesheet(),
        fetchNormHours(),
      ])
      setReport(r)
      setShifts(s)
      setBonuses(b)
      setHousekeepers(hk)
      setApartments(apts)
      setNormHours(nh)
      const ne: Record<AptType, string> = { studio: '', '1br': '', '2br': '' }
      nh.forEach((x) => { ne[x.apt_type] = String(x.hours) })
      setNormEdits(ne)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const weekDates = useMemo(() => DAYS.map((i) => toIso(addDays(parseIso(weekStart), i))), [weekStart])

  const totals = useMemo(() => {
    const total_hours = report.reduce((s, r) => s + r.total_hours, 0)
    const norm_hours = report.reduce((s, r) => s + r.norm_hours, 0)
    const bonus = report.reduce((s, r) => s + r.bonus, 0)
    return { total_hours, norm_hours, bonus }
  }, [report])

  const shiftsByStaff = useMemo(() => {
    const map: Record<number, Shift[]> = {}
    shifts.forEach((s) => {
      (map[s.staff_id] ??= []).push(s)
    })
    return map
  }, [shifts])

  const bonusByStaff = useMemo(() => {
    const map: Record<number, Bonus[]> = {}
    bonuses.forEach((b) => {
      (map[b.staff_id] ??= []).push(b)
    })
    return map
  }, [bonuses])

  function prevWeek() { setWeekStart(toIso(addDays(parseIso(weekStart), -7))) }
  function nextWeek() { setWeekStart(toIso(addDays(parseIso(weekStart), 7))) }
  function thisWeek() { setWeekStart(toIso(mondayOf(new Date()))) }

  function openNewShift(staffId: number, date: string) {
    setEditingShift({ staff_id: staffId, work_date: date, start_time: DEFAULT_START, end_time: DEFAULT_END, apartment_id: null, apt_type: null, note: '' })
  }
  function openEditShift(s: Shift) {
    setEditingShift({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time) })
  }

  async function handleSaveShift() {
    if (!editingShift) return
    try {
      const payload = { ...editingShift }
      if (payload.apartment_id) {
        const apt = apartments.find((a) => a.id === payload.apartment_id)
        payload.apt_type = apt?.type ?? null
      } else {
        payload.apt_type = null
      }
      const saved = await saveShift(payload)
      setShifts((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id)
        if (idx >= 0) { const cp = [...prev]; cp[idx] = saved; return cp }
        return [...prev, saved]
      })
      setEditingShift(null)
      toast(t.timesheet.shiftSaved, 'success')
      load()
    } catch (e) { toast(errorMessage(e), 'error') }
  }

  async function handleDeleteShift(id: string) {
    try {
      await deleteShift(id)
      setShifts((prev) => prev.filter((s) => s.id !== id))
      toast(t.timesheet.shiftDeleted, 'success')
      load()
    } catch (e) { toast(errorMessage(e), 'error') }
  }

  function openBonus(staffId: number) {
    const existing = bonusByStaff[staffId]?.[0]
    setEditingBonus({ staff_id: staffId, amount: existing ? String(existing.amount) : '', note: existing?.note ?? '', id: existing?.id })
  }

  async function handleSaveBonus() {
    if (!editingBonus) return
    try {
      const amount = parseFloat(editingBonus.amount) || 0
      await saveBonus({ id: editingBonus.id, staff_id: editingBonus.staff_id, week_start: weekStart, amount, note: editingBonus.note })
      setEditingBonus(null)
      toast(t.timesheet.bonusSaved, 'success')
      load()
    } catch (e) { toast(errorMessage(e), 'error') }
  }

  async function handleSaveNorms() {
    try {
      for (const apt_type of ['studio', '1br', '2br'] as AptType[]) {
        const val = parseFloat(normEdits[apt_type])
        if (!isNaN(val)) await saveNormHour(apt_type, val)
      }
      toast(t.timesheet.normsSaved, 'success')
      setShowNorms(false)
      load()
    } catch (e) { toast(errorMessage(e), 'error') }
  }

  const wsDate = parseIso(weekStart)
  const weekLabel = `${n(toIso(wsDate))} — ${n(toIso(addDays(wsDate, 6)))}`

  return (
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-xl font-semibold text-ink mb-4">{t.timesheet.title}</h1>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button onClick={prevWeek} className="p-2 rounded-lg bg-surface border border-line text-ink hover:bg-app transition-colors">
          <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
        </button>
        <button onClick={thisWeek} className="flex-1 text-center bg-surface border border-line rounded-lg py-2 text-sm font-medium text-ink hover:bg-app transition-colors">
          {n(weekLabel)}
        </button>
        <button onClick={nextWeek} className="p-2 rounded-lg bg-surface border border-line text-ink hover:bg-app transition-colors">
          <ChevronRight className="w-5 h-5 rtl:rotate-180" />
        </button>
      </div>

      {/* Totals card */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-surface border border-line rounded-xl p-3 text-center">
          <p className="text-xs text-muted mb-1">{t.timesheet.totalHours}</p>
          <p className="text-lg font-semibold text-ink">{n(totals.total_hours.toFixed(1))}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 text-center">
          <p className="text-xs text-muted mb-1">{t.timesheet.normHours}</p>
          <p className="text-lg font-semibold text-ink">{n(totals.norm_hours.toFixed(1))}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 text-center">
          <p className="text-xs text-muted mb-1">{t.timesheet.bonus}</p>
          <p className="text-lg font-semibold text-ink">{n(totals.bonus.toFixed(0))}</p>
        </div>
      </div>

      {/* Norm hours toggle */}
      <button
        onClick={() => setShowNorms((v) => !v)}
        className="w-full mb-4 bg-surface border border-line rounded-xl px-4 py-2.5 flex items-center justify-between text-sm text-ink hover:bg-app transition-colors"
      >
        <span>{t.timesheet.normHoursTitle}</span>
        <Clock className="w-4 h-4 text-muted" />
      </button>
      {showNorms && (
        <div className="bg-surface border border-line rounded-xl p-4 mb-4">
          <div className="space-y-3">
            {(['studio', '1br', '2br'] as AptType[]).map((apt_type) => (
              <div key={apt_type} className="flex items-center gap-3">
                <label className="text-sm text-muted w-20 flex-shrink-0">{t.timesheet[`norm_${apt_type}` as keyof typeof t.timesheet] as string}</label>
                <input
                  type="number"
                  step="0.5"
                  value={normEdits[apt_type]}
                  onChange={(e) => setNormEdits((p) => ({ ...p, [apt_type]: e.target.value }))}
                  className="flex-1 bg-app border border-line rounded-lg px-3 py-2 text-sm text-ink"
                />
                <span className="text-sm text-muted">{t.timesheet.hoursShort}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveNorms}
            className="w-full mt-3 bg-accent text-white rounded-lg py-2.5 text-sm font-medium"
          >
            {t.timesheet.save}
          </button>
        </div>
      )}

      {/* Staff cards */}
      {loading && <p className="text-center text-muted py-8">{t.app.loading}</p>}
      {!loading && report.length === 0 && <p className="text-center text-muted py-8">{t.timesheet.noStaff}</p>}

      <div className="space-y-2">
        {report.map((row) => {
          const isOpen = expanded === row.staff_id
          const staffShifts = shiftsByStaff[row.staff_id] ?? []
          const staffBonus = bonusByStaff[row.staff_id]?.[0]
          return (
            <div key={row.staff_id} className="bg-surface border border-line rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : row.staff_id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{row.full_name}</p>
                  <p className="text-xs text-muted">
                    {n(row.total_hours.toFixed(1))}h / {n(row.norm_hours.toFixed(1))}h
                    {row.bonus > 0 && ` + ${n(row.bonus.toFixed(0))}`}
                  </p>
                </div>
                <ChevronRight className={`w-5 h-5 text-muted transition-transform ${isOpen ? 'rotate-90 rtl:-rotate-90' : ''}`} />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-line">
                  {/* Day grid */}
                  <div className="grid grid-cols-1 gap-2 mt-3">
                    {DAYS.map((di) => {
                      const date = weekDates[di]
                      const dayShifts = staffShifts.filter((s) => s.work_date === date)
                      const dayKey = DAY_KEY[di]
                      return (
                        <div key={di} className="bg-app rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-muted">
                              {t.timesheet[`day_${dayKey}` as keyof typeof t.timesheet] as string}
                            </span>
                            <span className="text-xs text-muted">{n(date.slice(5))}</span>
                          </div>
                          {dayShifts.length === 0 && (
                            <button
                              onClick={() => openNewShift(row.staff_id, date)}
                              className="w-full flex items-center justify-center gap-1 text-xs text-accent py-1.5 hover:bg-surface rounded-lg transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {t.timesheet.addShift}
                            </button>
                          )}
                          {dayShifts.map((s) => {
                            const apt = apartments.find((a) => a.id === s.apartment_id)
                            const hrs = shiftHours(hhmm(s.start_time), hhmm(s.end_time))
                            return (
                              <div key={s.id} className="space-y-1">
                                <button
                                  onClick={() => openEditShift(s)}
                                  className="w-full flex items-center justify-between bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink hover:border-accent transition-colors"
                                >
                                  <span className="font-medium">{n(hhmm(s.start_time))}–{n(hhmm(s.end_time))}</span>
                                  <span className="text-muted text-xs">
                                    {apt ? apt.code : '—'}
                                    {s.note ? ` · ${s.note}` : ''}
                                  </span>
                                </button>
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs text-muted">{n(hrs.toFixed(1))} {t.timesheet.hoursShort}</span>
                                  <button
                                    onClick={() => handleDeleteShift(s.id)}
                                    className="text-bad p-1 hover:bg-bad-soft rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                          {dayShifts.length > 0 && (
                            <button
                              onClick={() => openNewShift(row.staff_id, date)}
                              className="w-full flex items-center justify-center gap-1 text-xs text-accent py-1.5 mt-1 hover:bg-surface rounded-lg transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {t.timesheet.addShift}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Bonus section */}
                  <div className="mt-3 pt-3 border-t border-line">
                    <button
                      onClick={() => openBonus(row.staff_id)}
                      className="w-full flex items-center justify-between text-sm text-ink py-1.5"
                    >
                      <span className="text-muted">{t.timesheet.bonus}</span>
                      <span className="font-medium">{n((staffBonus?.amount ?? 0).toFixed(0))}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Shift editor modal */}
      {editingShift && (
        <ShiftModal
          t={t}
          n={n}
          shift={editingShift}
          apartments={apartments}
          onChange={setEditingShift}
          onSave={handleSaveShift}
          onClose={() => setEditingShift(null)}
        />
      )}

      {/* Bonus editor modal */}
      {editingBonus && (
        <BonusModal
          t={t}
          n={n}
          data={editingBonus}
          onChange={setEditingBonus}
          onSave={handleSaveBonus}
          onClose={() => setEditingBonus(null)}
        />
      )}
    </div>
  )
}

function fetchApartmentsForTimesheet(): Promise<Apt[]> {
  return import('@/modules/apartments/api').then(({ fetchApartments }) =>
    fetchApartments().then((a) => a.map((x) => ({ id: x.id, code: x.code, type: x.type as AptType })))
  )
}

interface ShiftModalProps {
  t: ReturnType<typeof useI18n>['t']
  n: ReturnType<typeof useI18n>['n']
  shift: Partial<Shift> & { staff_id: number; work_date: string; start_time: string; end_time: string }
  apartments: Apt[]
  onChange: (s: Partial<Shift> & { staff_id: number; work_date: string; start_time: string; end_time: string }) => void
  onSave: () => void
  onClose: () => void
}

function ShiftModal({ t, n, shift, apartments, onChange, onSave, onClose }: ShiftModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-line p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">
            {shift.id ? t.timesheet.editShift : t.timesheet.addShift}
          </h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.date}</label>
            <input
              type="date"
              value={shift.work_date}
              onChange={(e) => onChange({ ...shift, work_date: e.target.value })}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted block mb-1">{t.timesheet.startTime}</label>
              <input
                type="time"
                value={shift.start_time}
                onChange={(e) => onChange({ ...shift, start_time: e.target.value })}
                className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink"
              />
            </div>
            <div>
              <label className="text-sm text-muted block mb-1">{t.timesheet.endTime}</label>
              <input
                type="time"
                value={shift.end_time}
                onChange={(e) => onChange({ ...shift, end_time: e.target.value })}
                className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.apartment}</label>
            <select
              value={shift.apartment_id ?? ''}
              onChange={(e) => onChange({ ...shift, apartment_id: e.target.value ? Number(e.target.value) : null })}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink"
            >
              <option value="">—</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>{a.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.note}</label>
            <input
              type="text"
              value={shift.note ?? ''}
              onChange={(e) => onChange({ ...shift, note: e.target.value })}
              placeholder={t.timesheet.notePlaceholder}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 bg-app border border-line rounded-lg py-2.5 text-sm font-medium text-ink">
            {t.timesheet.cancel}
          </button>
          <button onClick={onSave} className="flex-1 bg-accent text-white rounded-lg py-2.5 text-sm font-medium">
            {t.timesheet.save}
          </button>
        </div>
      </div>
    </div>
  )
}

interface BonusModalProps {
  t: ReturnType<typeof useI18n>['t']
  n: ReturnType<typeof useI18n>['n']
  data: { staff_id: number; amount: string; note: string; id?: string }
  onChange: (d: { staff_id: number; amount: string; note: string; id?: string }) => void
  onSave: () => void
  onClose: () => void
}

function BonusModal({ t, n, data, onChange, onSave, onClose }: BonusModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-line p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">{t.timesheet.editBonus}</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.bonusAmount}</label>
            <input
              type="number"
              step="1"
              value={data.amount}
              onChange={(e) => onChange({ ...data, amount: e.target.value })}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink"
            />
          </div>
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.note}</label>
            <input
              type="text"
              value={data.note}
              onChange={(e) => onChange({ ...data, note: e.target.value })}
              placeholder={t.timesheet.notePlaceholder}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 bg-app border border-line rounded-lg py-2.5 text-sm font-medium text-ink">
            {t.timesheet.cancel}
          </button>
          <button onClick={onSave} className="flex-1 bg-accent text-white rounded-lg py-2.5 text-sm font-medium">
            {t.timesheet.save}
          </button>
        </div>
      </div>
    </div>
  )
}
