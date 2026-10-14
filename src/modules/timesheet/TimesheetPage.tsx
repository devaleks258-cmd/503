import { useEffect, useState, useMemo, useCallback } from 'react'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { fetchApartments } from '@/modules/apartments/api'
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, X, Search, Download, CalendarDays } from 'lucide-react'
import {
  fetchHousekeepers, fetchWeekReport, fetchWorkDays, saveWorkDay, deleteWorkDay,
  fetchWorkLines, syncWorkLines, fetchBonuses, saveBonus, fetchNormHours, saveNormHour,
  toIso, parseIso, mondayOf, addDays, hhmm, shiftHours,
  type HkStaff, type WeekRow, type WorkDay, type WorkLine, type Bonus, type NormHour, type AptType,
} from '@/modules/timesheet/api'
import type { SvApartment } from '@/lib/database.types'

const DAYS = [0, 1, 2, 3, 4, 5, 6]
const DAY_KEY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const TYPE_COLORS: Record<AptType, string> = {
  studio: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700',
  '1br': 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
  '2br': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
}
const TYPE_DOT: Record<AptType, string> = {
  studio: 'bg-sky-500',
  '1br': 'bg-emerald-500',
  '2br': 'bg-amber-500',
}
const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '17:00'

interface AptPick { id: number; code: string; type: AptType; building: string }

export function TimesheetPage() {
  const { t, n } = useI18n()
  const [weekStart, setWeekStart] = useState(() => toIso(mondayOf(new Date())))
  const [report, setReport] = useState<WeekRow[]>([])
  const [workDays, setWorkDays] = useState<WorkDay[]>([])
  const [workLines, setWorkLines] = useState<WorkLine[]>([])
  const [housekeepers, setHousekeepers] = useState<HkStaff[]>([])
  const [apartments, setApartments] = useState<AptPick[]>([])
  const [normHours, setNormHours] = useState<NormHour[]>([])
  const [bonuses, setBonuses] = useState<Bonus[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [dayEditor, setDayEditor] = useState<{ staffId: number; date: string; wd: WorkDay | null } | null>(null)
  const [bonusEditor, setBonusEditor] = useState<{ staffId: number; amount: string; note: string; id?: string } | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [showNorms, setShowNorms] = useState(false)
  const [normEdits, setNormEdits] = useState<Record<AptType, string>>({ studio: '', '1br': '', '2br': '' })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, wd, hk, apts, nh, bn] = await Promise.all([
        fetchWeekReport(weekStart), fetchWorkDays(weekStart), fetchHousekeepers(),
        fetchApartments(), fetchNormHours(), fetchBonuses(weekStart),
      ])
      setReport(r); setWorkDays(wd); setHousekeepers(hk)
      setApartments(apts.map((a: SvApartment) => ({ id: a.id, code: a.code, type: a.type as AptType, building: a.building })))
      setNormHours(nh); setBonuses(bn)
      const ne: Record<AptType, string> = { studio: '', '1br': '', '2br': '' }
      nh.forEach((x) => { ne[x.apt_type] = String(x.hours) })
      setNormEdits(ne)
      const lines = await fetchWorkLines(wd.map((d) => d.id))
      setWorkLines(lines)
    } catch (e) { toast(errorMessage(e), 'error') }
    finally { setLoading(false) }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const weekDates = useMemo(() => DAYS.map((i) => toIso(addDays(parseIso(weekStart), i))), [weekStart])

  const totals = useMemo(() => ({
    total: report.reduce((s, r) => s + r.total_hours, 0),
    norm: report.reduce((s, r) => s + r.norm_hours, 0),
    bonus: report.reduce((s, r) => s + r.bonus, 0),
  }), [report])

  const daysByStaff = useMemo(() => {
    const map: Record<number, Record<string, WorkDay>> = {}
    workDays.forEach((d) => { (map[d.staff_id] ??= {})[d.work_date] = d })
    return map
  }, [workDays])

  const linesByDay = useMemo(() => {
    const map: Record<string, WorkLine[]> = {}
    workLines.forEach((l) => { (map[l.work_day_id] ??= []).push(l) })
    return map
  }, [workLines])

  const bonusByStaff = useMemo(() => {
    const map: Record<number, Bonus[]> = {}
    bonuses.forEach((b) => { (map[b.staff_id] ??= []).push(b) })
    return map
  }, [bonuses])

  const normMap = useMemo(() => {
    const m: Record<string, number> = {}
    normHours.forEach((x) => { m[x.apt_type] = x.hours })
    return m
  }, [normHours])

  function prevWeek() { setWeekStart(toIso(addDays(parseIso(weekStart), -7))) }
  function nextWeek() { setWeekStart(toIso(addDays(parseIso(weekStart), 7))) }
  function thisWeek() { setWeekStart(toIso(mondayOf(new Date()))) }

  const wsDate = parseIso(weekStart)
  const weekLabel = `${n(toIso(wsDate))} — ${n(toIso(addDays(wsDate, 6)))}`

  function openDayEditor(staffId: number, date: string) {
    const wd = daysByStaff[staffId]?.[date] ?? null
    setDayEditor({ staffId, date, wd })
  }

  function openBonusEditor(staffId: number) {
    const existing = bonusByStaff[staffId]?.[0]
    setBonusEditor({ staffId, amount: existing ? String(existing.amount) : '', note: existing?.note ?? '', id: existing?.id })
  }

  async function handleSaveBonus() {
    if (!bonusEditor) return
    try {
      const amount = parseFloat(bonusEditor.amount) || 0
      await saveBonus({ id: bonusEditor.id, staff_id: bonusEditor.staffId, week_start: weekStart, amount, note: bonusEditor.note })
      setBonusEditor(null)
      toast(t.timesheet.bonusSaved, 'success')
      load()
    } catch (e) { toast(errorMessage(e), 'error') }
  }

  async function handleSaveNorms() {
    try {
      for (const at of ['studio', '1br', '2br'] as AptType[]) {
        const v = parseFloat(normEdits[at])
        if (!isNaN(v)) await saveNormHour(at, v)
      }
      toast(t.timesheet.normsSaved, 'success')
      setShowNorms(false); load()
    } catch (e) { toast(errorMessage(e), 'error') }
  }

  function exportCSV() {
    const sep = ','
    const header = [t.timesheet.colName, t.timesheet.colHours, t.timesheet.colNorm, t.timesheet.colBonus].join(sep)
    const rows = report.map((r) =>
      [r.full_name, r.total_hours.toFixed(1), r.norm_hours.toFixed(1), r.bonus.toFixed(0)].join(sep)
    )
    const csv = [header, ...rows, '', `${t.timesheet.colTotal}${sep}${totals.total.toFixed(1)}${sep}${totals.norm.toFixed(1)}${sep}${totals.bonus.toFixed(0)}`].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `timesheet_${weekStart}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{t.timesheet.title}</h1>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm text-accent bg-accent-soft px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {/* Week nav */}
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

      {/* Summary toggle */}
      <button onClick={() => setShowSummary(v => !v)} className="w-full mb-3 bg-surface border border-line rounded-xl px-4 py-2.5 flex items-center justify-between text-sm text-ink hover:bg-app transition-colors">
        <span>{t.timesheet.weekSummary}</span>
        <CalendarDays className="w-4 h-4 text-muted" />
      </button>
      {showSummary && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-surface border border-line rounded-xl p-3 text-center">
            <p className="text-xs text-muted mb-1">{t.timesheet.totalHours}</p>
            <p className="text-lg font-semibold text-ink">{n(totals.total.toFixed(1))}</p>
          </div>
          <div className="bg-surface border border-line rounded-xl p-3 text-center">
            <p className="text-xs text-muted mb-1">{t.timesheet.normHours}</p>
            <p className="text-lg font-semibold text-ink">{n(totals.norm.toFixed(1))}</p>
          </div>
          <div className="bg-surface border border-line rounded-xl p-3 text-center">
            <p className="text-xs text-muted mb-1">{t.timesheet.bonus}</p>
            <p className="text-lg font-semibold text-ink">{n(totals.bonus.toFixed(0))}</p>
          </div>
        </div>
      )}

      {/* Norms toggle */}
      <button onClick={() => setShowNorms(v => !v)} className="w-full mb-4 bg-surface border border-line rounded-xl px-4 py-2.5 flex items-center justify-between text-sm text-ink hover:bg-app transition-colors">
        <span>{t.timesheet.normHoursTitle}</span>
        <Clock className="w-4 h-4 text-muted" />
      </button>
      {showNorms && (
        <div className="bg-surface border border-line rounded-xl p-4 mb-4 space-y-3">
          {(['studio', '1br', '2br'] as AptType[]).map((at) => (
            <div key={at} className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${TYPE_DOT[at]}`} />
              <label className="text-sm text-muted w-24 flex-shrink-0">{t.timesheet[`norm_${at}` as keyof typeof t.timesheet] as string}</label>
              <input type="number" step="0.5" value={normEdits[at]}
                onChange={(e) => setNormEdits(p => ({ ...p, [at]: e.target.value }))}
                className="flex-1 bg-app border border-line rounded-lg px-3 py-2 text-sm text-ink" />
              <span className="text-sm text-muted">{t.timesheet.hoursShort}</span>
            </div>
          ))}
          <button onClick={handleSaveNorms} className="w-full mt-1 bg-accent text-white rounded-lg py-2.5 text-sm font-medium">{t.timesheet.save}</button>
        </div>
      )}

      {/* Staff cards */}
      {loading && <p className="text-center text-muted py-8">{t.app.loading}</p>}
      {!loading && report.length === 0 && <p className="text-center text-muted py-8">{t.timesheet.noStaff}</p>}

      <div className="space-y-2">
        {report.map((row) => {
          const isOpen = expanded === row.staff_id
          const staffDays = daysByStaff[row.staff_id] ?? {}
          const staffBonus = bonusByStaff[row.staff_id]?.[0]
          return (
            <div key={row.staff_id} className="bg-surface border border-line rounded-xl overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : row.staff_id)} className="w-full px-4 py-3 flex items-center justify-between text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{row.full_name}</p>
                  <p className="text-xs text-muted">
                    {n(row.total_hours.toFixed(1))}{t.timesheet.hoursShort} / {n(row.norm_hours.toFixed(1))}{t.timesheet.hoursShort}
                    {row.bonus > 0 && ` + ${n(row.bonus.toFixed(0))}`}
                  </p>
                </div>
                <ChevronRight className={`w-5 h-5 text-muted transition-transform ${isOpen ? 'rotate-90 rtl:-rotate-90' : ''}`} />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-line">
                  {/* Mon–Sun bar */}
                  <div className="grid grid-cols-7 gap-1 mt-3">
                    {DAYS.map((di) => {
                      const date = weekDates[di]
                      const wd = staffDays[date]
                      const dayLines = wd ? (linesByDay[wd.id] ?? []) : []
                      const dayNorm = dayLines.reduce((s, l) => s + (l.apt_type ? normMap[l.apt_type] ?? 0 : 0), 0)
                      return (
                        <button key={di} onClick={() => openDayEditor(row.staff_id, date)}
                          className={`rounded-lg p-1.5 flex flex-col items-center gap-0.5 border transition-colors ${
                            wd ? 'border-accent bg-accent-soft' : 'border-line bg-app hover:border-accent'
                          }`}>
                          <span className="text-[10px] font-medium text-muted">
                            {t.timesheet[`day_${DAY_KEY[di]}` as keyof typeof t.timesheet] as string}
                          </span>
                          <span className="text-[10px] text-muted">{n(date.slice(5))}</span>
                          {wd ? (
                            <span className="text-[10px] font-semibold text-accent leading-tight">
                              {n(hhmm(wd.open_time))}<br/>{n(hhmm(wd.close_time))}
                            </span>
                          ) : (
                            <Plus className="w-3 h-3 text-muted mt-0.5" />
                          )}
                          {dayNorm > 0 && (
                            <span className="text-[9px] text-muted">{n(dayNorm.toFixed(1))}{t.timesheet.hoursShort}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Bonus row */}
                  <div className="mt-3 pt-3 border-t border-line">
                    <button onClick={() => openBonusEditor(row.staff_id)} className="w-full flex items-center justify-between text-sm text-ink py-1.5">
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

      {/* Type legend */}
      <div className="flex items-center gap-4 mt-4 justify-center">
        {(['studio', '1br', '2br'] as AptType[]).map((at) => (
          <div key={at} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${TYPE_DOT[at]}`} />
            <span className="text-xs text-muted">{t.timesheet[`norm_${at}` as keyof typeof t.timesheet] as string}</span>
          </div>
        ))}
      </div>

      {dayEditor && (
        <DayEditor
          t={t} n={n} staffId={dayEditor.staffId} date={dayEditor.date} wd={dayEditor.wd}
          apartments={apartments} normMap={normMap} existingLines={dayEditor.wd ? linesByDay[dayEditor.wd.id] ?? [] : []}
          onClose={() => setDayEditor(null)}
          onSaved={() => { setDayEditor(null); load() }}
        />
      )}

      {bonusEditor && (
        <BonusModal t={t} n={n} data={bonusEditor} onChange={setBonusEditor} onSave={handleSaveBonus} onClose={() => setBonusEditor(null)} />
      )}
    </div>
  )
}

// ── Day Editor Sheet ──────────────────────────────────────────

interface DayEditorProps {
  t: ReturnType<typeof useI18n>['t']
  n: ReturnType<typeof useI18n>['n']
  staffId: number
  date: string
  wd: WorkDay | null
  apartments: AptPick[]
  normMap: Record<string, number>
  existingLines: WorkLine[]
  onClose: () => void
  onSaved: () => void
}

function DayEditor({ t, n, staffId, date, wd, apartments, normMap, existingLines, onClose, onSaved }: DayEditorProps) {
  const [openTime, setOpenTime] = useState(wd ? hhmm(wd.open_time) : DEFAULT_OPEN)
  const [closeTime, setCloseTime] = useState(wd ? hhmm(wd.close_time) : DEFAULT_CLOSE)
  const [note, setNote] = useState(wd?.note ?? '')
  const [selectedApts, setSelectedApts] = useState<number[]>(() =>
    existingLines.map((l) => l.apartment_id).filter((x): x is number => x !== null)
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const actualHours = useMemo(() => shiftHours(openTime, closeTime), [openTime, closeTime])

  const normTotal = useMemo(() => {
    return selectedApts.reduce((s, aid) => {
      const apt = apartments.find((a) => a.id === aid)
      return s + (apt ? normMap[apt.type] ?? 0 : 0)
    }, 0)
  }, [selectedApts, apartments, normMap])

  const filteredApts = useMemo(() => {
    const q = search.toLowerCase().trim()
    return apartments.filter((a) => !q || a.code.toLowerCase().includes(q) || a.building.toLowerCase().includes(q))
  }, [apartments, search])

  function toggleApt(id: number) {
    setSelectedApts((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  }

  async function handleSave() {
    setSaving(true)
    try {
      const savedWd = await saveWorkDay({ id: wd?.id, staff_id: staffId, work_date: date, open_time: openTime, close_time: closeTime, note: note || null })
      const apts = selectedApts.map((aid) => {
        const a = apartments.find((x) => x.id === aid)!
        return { apartment_id: aid, apt_type: a.type }
      })
      await syncWorkLines(savedWd.id, apts)
      toast(t.timesheet.daySaved, 'success')
      onSaved()
    } catch (e) { toast(errorMessage(e), 'error') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!wd) { onClose(); return }
    setSaving(true)
    try {
      await deleteWorkDay(wd.id)
      toast(t.timesheet.dayDeleted, 'success')
      onSaved()
    } catch (e) { toast(errorMessage(e), 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 anim-scrim" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-line max-h-[90vh] overflow-y-auto anim-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface px-5 pt-5 pb-3 border-b border-line flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{n(date)} — {t.timesheet.workDay}</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Open / Close times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted block mb-1">{t.timesheet.openTime}</label>
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)}
                className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink" />
            </div>
            <div>
              <label className="text-sm text-muted block mb-1">{t.timesheet.closeTime}</label>
              <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)}
                className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink" />
            </div>
          </div>

          {/* Live actual / norm */}
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-lg p-3 text-center border ${actualHours >= normTotal ? 'border-line bg-app' : 'border-warn bg-warn-soft'}`}>
              <p className="text-xs text-muted mb-0.5">{t.timesheet.actual}</p>
              <p className="text-lg font-semibold text-ink">{n(actualHours.toFixed(1))}{t.timesheet.hoursShort}</p>
            </div>
            <div className="rounded-lg p-3 text-center border border-line bg-app">
              <p className="text-xs text-muted mb-0.5">{t.timesheet.normHours}</p>
              <p className="text-lg font-semibold text-ink">{n(normTotal.toFixed(1))}{t.timesheet.hoursShort}</p>
            </div>
          </div>
          {normTotal > 0 && (
            <div className={`text-center text-xs font-medium ${actualHours >= normTotal ? 'text-ok' : 'text-warn'}`}>
              {actualHours >= normTotal ? t.timesheet.normMet : t.timesheet.normShort}
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.note}</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t.timesheet.notePlaceholder}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink" />
          </div>

          {/* Apartment search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t.timesheet.searchApt}
              className="w-full bg-app rounded-lg pl-10 pr-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none" />
          </div>

          {/* Apartment list with color + checkbox */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {filteredApts.map((a) => {
              const checked = selectedApts.includes(a.id)
              return (
                <button key={a.id} onClick={() => toggleApt(a.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 border transition-colors text-left ${
                    checked ? 'border-accent bg-accent-soft' : 'border-line bg-app hover:border-accent'
                  }`}>
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${TYPE_DOT[a.type]}`} />
                  <span className="text-sm font-medium text-ink flex-1">{n(a.code)}</span>
                  <span className="text-xs text-muted">{t.timesheet[`norm_${a.type}` as keyof typeof t.timesheet] as string}</span>
                  <span className="text-xs text-muted">{n((normMap[a.type] ?? 0).toFixed(1))}{t.timesheet.hoursShort}</span>
                  {checked && <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-xs flex-shrink-0">✓</span>}
                </button>
              )
            })}
          </div>

          {/* Selected chips */}
          {selectedApts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedApts.map((aid) => {
                const a = apartments.find((x) => x.id === aid)
                if (!a) return null
                return (
                  <span key={aid} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border ${TYPE_COLORS[a.type]}`}>
                    {n(a.code)}
                    <button onClick={() => toggleApt(aid)} className="ml-0.5"><X className="w-3 h-3" /></button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-surface px-5 py-4 border-t border-line flex gap-2">
          {wd && (
            <button onClick={handleDelete} disabled={saving} className="px-3 py-2.5 bg-bad-soft text-bad rounded-lg text-sm font-medium border border-line">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="flex-1 bg-app border border-line rounded-lg py-2.5 text-sm font-medium text-ink">{t.timesheet.cancel}</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-accent text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">{t.timesheet.save}</button>
        </div>
      </div>
    </div>
  )
}

// ── Bonus Modal ──────────────────────────────────────────────

interface BonusModalProps {
  t: ReturnType<typeof useI18n>['t']
  n: ReturnType<typeof useI18n>['n']
  data: { staffId: number; amount: string; note: string; id?: string }
  onChange: (d: { staffId: number; amount: string; note: string; id?: string }) => void
  onSave: () => void
  onClose: () => void
}

function BonusModal({ t, n, data, onChange, onSave, onClose }: BonusModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 anim-scrim" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-line p-5 anim-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">{t.timesheet.bonus}</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.bonus}</label>
            <input type="number" step="1" value={data.amount}
              onChange={(e) => onChange({ ...data, amount: e.target.value })}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink" />
          </div>
          <div>
            <label className="text-sm text-muted block mb-1">{t.timesheet.note}</label>
            <input type="text" value={data.note}
              onChange={(e) => onChange({ ...data, note: e.target.value })}
              placeholder={t.timesheet.notePlaceholder}
              className="w-full bg-app border border-line rounded-lg px-3 py-2.5 text-sm text-ink" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 bg-app border border-line rounded-lg py-2.5 text-sm font-medium text-ink">{t.timesheet.cancel}</button>
          <button onClick={onSave} className="flex-1 bg-accent text-white rounded-lg py-2.5 text-sm font-medium">{t.timesheet.save}</button>
        </div>
      </div>
    </div>
  )
}
