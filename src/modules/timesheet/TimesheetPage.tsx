import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Download, Loader2, Lock, Plus, RotateCcw } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/modules/core/store'
import { toast } from '@/lib/toast'
import type { HkLine, HkStaff } from '@/lib/database.types'
import { closeWeek, fetchRefs, fetchWeek, reopenWeek, type Refs, type WeekData } from '@/modules/timesheet/api'
import {
  addDays,
  csvNum,
  dayOfMonth,
  downloadText,
  fmtCairoDayMonth,
  fmtDayMonth,
  fmtMoney,
  fmtNum,
  fmtWeekRange,
  hhmm,
  mondayOf,
  sumTotals,
  todayCairo,
  toCsv,
  totalsFor,
  weekDays,
  type Totals,
} from '@/modules/timesheet/lib'
import { ShiftSheet } from '@/modules/timesheet/ShiftSheet'
import { hkErrorText } from '@/modules/timesheet/ui'

type Tab = 'grid' | 'summary'

export function TimesheetPage() {
  const { t, lang, n } = useI18n()
  const isAdmin = useAuth((s) => s.profile?.role === 'admin')
  const today = todayCairo()
  const currentWeek = mondayOf(today)

  const [weekStart, setWeekStart] = useState(currentWeek)
  const [refs, setRefs] = useState<Refs | null>(null)
  const [data, setData] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('grid')
  const [editing, setEditing] = useState<{ staffId: number; date: string } | null>(null)
  const [confirm, setConfirm] = useState<'close' | 'reopen' | null>(null)
  const [busy, setBusy] = useState(false)
  const refsRef = useRef<Refs | null>(null)
  const reqRef = useRef(0)

  const load = useCallback(async (ws: string, silent: boolean) => {
    const req = ++reqRef.current
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [r, w] = await Promise.all([refsRef.current ? Promise.resolve(refsRef.current) : fetchRefs(), fetchWeek(ws)])
      if (req !== reqRef.current) return
      refsRef.current = r
      setRefs(r)
      setData(w)
    } catch (e) {
      if (req !== reqRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (req === reqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(weekStart, false)
  }, [weekStart, load])

  const closeSheet = useCallback(() => setEditing(null), [])

  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const closed = data?.closure != null

  const staffList = useMemo<HkStaff[]>(() => {
    if (!refs || !data) return []
    const worked = new Set(data.shifts.map((s) => s.staff_id))
    return refs.staff.filter((s) => s.active || worked.has(s.id))
  }, [refs, data])

  const shiftMap = useMemo(() => new Map((data?.shifts ?? []).map((s) => [`${s.staff_id}|${s.work_date}`, s])), [data])

  const linesByShift = useMemo(() => {
    const m = new Map<number, HkLine[]>()
    for (const l of data?.lines ?? []) {
      const arr = m.get(l.shift_id) ?? []
      arr.push(l)
      m.set(l.shift_id, arr)
    }
    return m
  }, [data])

  const totalsMap = useMemo(() => {
    const m = new Map<number, Totals>()
    if (data) for (const s of staffList) m.set(s.id, totalsFor(s.id, data.shifts, data.lines))
    return m
  }, [data, staffList])

  const grand = useMemo(() => sumTotals(Array.from(totalsMap.values())), [totalsMap])
  const emptyTotals: Totals = { days: 0, hours: 0, apartments: 0, bonus: 0 }

  const handleClose = async () => {
    setBusy(true)
    try {
      await closeWeek(weekStart)
      toast(t.hk.weekClosedToast, 'success')
      setConfirm(null)
      await load(weekStart, true)
    } catch (e) {
      toast(hkErrorText(t, e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleReopen = async () => {
    setBusy(true)
    try {
      await reopenWeek(weekStart)
      toast(t.hk.weekReopenedToast, 'success')
      setConfirm(null)
      await load(weekStart, true)
    } catch (e) {
      toast(hkErrorText(t, e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    if (!data || !refs) return
    const code = new Map(refs.apartments.map((a) => [a.id, a.code]))
    const c = t.hk.csv
    const rows: string[][] = [[c.staff, c.date, c.start, c.end, c.hours, c.apartments, c.share, c.bonus]]
    for (const st of staffList) {
      const mine = data.shifts.filter((s) => s.staff_id === st.id)
      if (mine.length === 0) continue
      for (const s of mine) {
        const ls = linesByShift.get(s.id) ?? []
        rows.push([
          st.full_name,
          s.work_date,
          hhmm(s.start_time),
          hhmm(s.end_time),
          csvNum(Number(s.hours), lang),
          ls.map((l) => code.get(l.apartment_id) ?? String(l.apartment_id)).join(' '),
          csvNum(ls.reduce((a, l) => a + Number(l.share), 0), lang),
          csvNum(ls.reduce((a, l) => a + Number(l.bonus), 0), lang),
        ])
      }
      const tot = totalsMap.get(st.id) ?? emptyTotals
      rows.push([`${st.full_name} — ${c.total}`, '', '', '', csvNum(tot.hours, lang), '', csvNum(tot.apartments, lang), csvNum(tot.bonus, lang)])
    }
    rows.push([c.total, '', '', '', csvNum(grand.hours, lang), '', csvNum(grand.apartments, lang), csvNum(grand.bonus, lang)])
    downloadText(`timesheet_${weekStart}.csv`, toCsv(rows, lang))
  }

  const openCell = (staffId: number, date: string) => setEditing({ staffId, date })

  const renderCell = (st: HkStaff, date: string, idx: number) => {
    const shift = shiftMap.get(`${st.id}|${date}`) ?? null
    const future = date > today
    const disabled = future || (closed && !shift)
    const ls = shift ? linesByShift.get(shift.id) ?? [] : []
    const hasBonus = ls.some((l) => Number(l.bonus) > 0)
    const style = shift
      ? 'bg-accent-soft border-accent'
      : disabled
        ? 'border-transparent opacity-40'
        : 'border-dashed border-line hover:bg-app'
    return (
      <button
        key={date}
        onClick={() => openCell(st.id, date)}
        disabled={disabled}
        aria-label={`${st.full_name}, ${fmtDayMonth(date, lang)}`}
        className={`flex flex-col items-center justify-center rounded-xl border py-1.5 min-h-[66px] transition-colors ${style} ${
          date === today ? 'ring-2 ring-accent' : ''
        }`}
      >
        <span className="text-[10px] text-muted leading-none">{t.hk.weekdaysShort[idx]}</span>
        <span className="text-xs text-ink font-medium leading-tight mt-0.5">{n(String(dayOfMonth(date)))}</span>
        {shift ? (
          <>
            <span className="text-[13px] font-semibold text-accent tabular-nums leading-tight mt-0.5">
              {fmtNum(Number(shift.hours), lang, 1)}
            </span>
            <span className="text-[10px] text-muted leading-none tabular-nums">
              {fmtNum(ls.length, lang, 0)} {t.hk.aptShort}
              {hasBonus && <span className="text-warn"> ★</span>}
            </span>
          </>
        ) : (
          <span className="mt-1 h-4 flex items-center text-muted">
            {disabled ? <span className="text-xs">–</span> : <Plus className="w-3.5 h-3.5" />}
          </span>
        )}
      </button>
    )
  }

  const sheet = (() => {
    if (!editing || !refs || !data) return null
    const staff = refs.staff.find((s) => s.id === editing.staffId)
    if (!staff) return null
    const shift = shiftMap.get(`${staff.id}|${editing.date}`) ?? null
    const prevShift =
      data.shifts
        .filter((s) => s.staff_id === staff.id && s.work_date < editing.date)
        .sort((a, b) => (a.work_date < b.work_date ? 1 : -1))[0] ?? null
    return (
      <ShiftSheet
        key={`${staff.id}|${editing.date}`}
        staff={staff}
        date={editing.date}
        shift={shift}
        shiftLines={shift ? linesByShift.get(shift.id) ?? [] : []}
        dayLines={data.lines.filter((l) => l.work_date === editing.date)}
        staffNames={new Map(refs.staff.map((s) => [s.id, s.full_name]))}
        apartments={refs.apartments}
        prevShift={prevShift}
        readOnly={closed}
        onClose={closeSheet}
        onChanged={() => {
          setEditing(null)
          void load(weekStart, true)
        }}
      />
    )
  })()

  const weekEnd = addDays(weekStart, 6)

  return (
    <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto w-full space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
          <CalendarClock className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink leading-tight">{t.hk.title}</h1>
          <p className="text-xs text-muted">{t.hk.subtitle}</p>
        </div>
      </div>

      {/* навигация по неделям */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          aria-label={t.hk.prevWeek}
          className="w-10 h-10 shrink-0 rounded-xl bg-surface border border-line flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-ink rtl:rotate-180" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <p className="text-base font-semibold text-ink tabular-nums">{n(fmtWeekRange(weekStart, lang))}</p>
          <div className="mt-0.5 flex items-center justify-center gap-2 flex-wrap">
            {data &&
              (closed ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warn bg-warn-soft rounded-full px-2.5 py-0.5">
                  <Lock className="w-3 h-3" />
                  {t.hk.weekClosed}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok bg-ok-soft rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
                  {t.hk.weekOpen}
                </span>
              ))}
            {weekStart !== currentWeek && (
              <button onClick={() => setWeekStart(currentWeek)} className="text-xs text-accent underline underline-offset-2">
                {t.hk.thisWeek}
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          disabled={weekStart >= currentWeek}
          aria-label={t.hk.nextWeek}
          className="w-10 h-10 shrink-0 rounded-xl bg-surface border border-line flex items-center justify-center disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-ink rtl:rotate-180" />
        </button>
      </div>

      {/* итоги недели */}
      <div className="bg-surface rounded-2xl border border-line grid grid-cols-3 divide-x divide-[var(--line)] rtl:divide-x-reverse">
        <div className="px-3 py-3 text-center">
          <p className="text-[11px] text-muted">{t.hk.hours}</p>
          <p className="text-xl font-semibold text-ink tabular-nums">{fmtNum(grand.hours, lang, 1)}</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[11px] text-muted">{t.hk.apartments}</p>
          <p className="text-xl font-semibold text-ink tabular-nums">{fmtNum(grand.apartments, lang, 1)}</p>
        </div>
        <div className="px-3 py-3 text-center bg-accent-soft rounded-e-2xl">
          <p className="text-[11px] text-muted">{t.hk.bonus}</p>
          <p className="text-xl font-semibold text-accent tabular-nums">{fmtMoney(grand.bonus, lang)}</p>
        </div>
      </div>

      {/* вкладки */}
      <div className="grid grid-cols-2 gap-1 bg-surface border border-line rounded-xl p-1">
        {(['grid', 'summary'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === k ? 'bg-accent text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {k === 'grid' ? t.hk.tabGrid : t.hk.tabSummary}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 text-muted animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-bad-soft border border-line rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-bad shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-bad">{t.hk.loadError}</p>
            <p className="text-xs text-muted mt-0.5 break-words">{hkErrorText(t, new Error(error))}</p>
            <button onClick={() => void load(weekStart, false)} className="mt-2 text-sm text-accent font-medium">
              {t.retry}
            </button>
          </div>
        </div>
      )}

      {!loading && !error && data && staffList.length === 0 && (
        <p className="text-sm text-muted text-center py-8">{t.hk.noStaff}</p>
      )}

      {/* табель по дням */}
      {!loading && !error && data && tab === 'grid' && staffList.length > 0 && (
        <div className="space-y-3">
          {closed && (
            <p className="text-xs text-muted text-center flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" />
              {t.hk.readOnly}
            </p>
          )}
          {staffList.map((st) => {
            const tot = totalsMap.get(st.id) ?? emptyTotals
            return (
              <section key={st.id} className="bg-surface rounded-2xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-3 mb-2 px-1">
                  <h3 className="font-semibold text-ink truncate">
                    {st.full_name}
                    {!st.active && <span className="ms-2 text-[11px] font-normal text-muted">{t.hk.inactive}</span>}
                  </h3>
                  <span className="text-xs text-muted tabular-nums shrink-0">
                    {fmtNum(tot.hours, lang, 1)} {t.hk.hoursShort} · {fmtNum(tot.apartments, lang, 1)} {t.hk.aptShort}
                    {tot.bonus > 0 && <span className="text-warn"> · {fmtMoney(tot.bonus, lang)}</span>}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">{days.map((d, i) => renderCell(st, d, i))}</div>
              </section>
            )
          })}
        </div>
      )}

      {/* итоги по сотрудникам */}
      {!loading && !error && data && tab === 'summary' && staffList.length > 0 && (
        <div className="space-y-3">
          <div className="bg-surface rounded-2xl border border-line overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_3rem_4.5rem] gap-x-2 px-3 py-2 text-[11px] text-muted bg-app">
              <span>{t.hk.employee}</span>
              <span className="text-end">{t.hk.daysWorked}</span>
              <span className="text-end">{t.hk.hours}</span>
              <span className="text-end">{t.hk.aptShort}</span>
              <span className="text-end">{t.hk.bonus}</span>
            </div>
            {staffList.map((st) => {
              const tot = totalsMap.get(st.id) ?? emptyTotals
              return (
                <div
                  key={st.id}
                  className="grid grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_3rem_4.5rem] gap-x-2 px-3 py-2.5 text-sm border-t border-line items-center"
                >
                  <span className="text-ink truncate">{st.full_name}</span>
                  <span className="text-end tabular-nums text-muted">{fmtNum(tot.days, lang, 0)}</span>
                  <span className="text-end tabular-nums text-ink">{fmtNum(tot.hours, lang, 1)}</span>
                  <span className="text-end tabular-nums text-ink">{fmtNum(tot.apartments, lang, 1)}</span>
                  <span className={`text-end tabular-nums ${tot.bonus > 0 ? 'text-warn font-medium' : 'text-muted'}`}>
                    {fmtNum(tot.bonus, lang, 2)}
                  </span>
                </div>
              )
            })}
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_3rem_4.5rem] gap-x-2 px-3 py-3 text-sm border-t border-line bg-accent-soft font-semibold items-center">
              <span className="text-ink">{t.hk.total}</span>
              <span className="text-end tabular-nums text-ink">{fmtNum(grand.days, lang, 0)}</span>
              <span className="text-end tabular-nums text-ink">{fmtNum(grand.hours, lang, 1)}</span>
              <span className="text-end tabular-nums text-ink">{fmtNum(grand.apartments, lang, 1)}</span>
              <span className="text-end tabular-nums text-accent">{fmtNum(grand.bonus, lang, 2)}</span>
            </div>
          </div>
          <p className="text-xs text-muted px-1">{t.hk.amountsIn}</p>

          <button
            onClick={exportCsv}
            disabled={grand.days === 0}
            className="w-full bg-surface border border-line rounded-xl py-3 text-sm font-medium text-ink flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            {t.hk.exportCsv}
          </button>

          {closed && data.closure ? (
            <div className="bg-warn-soft rounded-xl px-4 py-3 flex items-center gap-3">
              <Lock className="w-5 h-5 text-warn shrink-0" />
              <p className="flex-1 text-sm text-warn">
                {t.hk.closedAt.replace('{d}', fmtCairoDayMonth(data.closure.closed_at, lang))}
              </p>
              {isAdmin && (
                <button
                  onClick={() => setConfirm('reopen')}
                  className="text-sm font-medium text-ink bg-surface border border-line rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t.hk.reopenWeek}
                </button>
              )}
            </div>
          ) : (
            weekStart <= currentWeek && (
              <button
                onClick={() => setConfirm('close')}
                className="w-full bg-accent text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {t.hk.closeWeek}
              </button>
            )
          )}
        </div>
      )}

      {sheet}

      {confirm && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 anim-scrim"
          onClick={() => !busy && setConfirm(null)}
        >
          <div className="bg-surface rounded-2xl w-full max-w-sm p-5 anim-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ink">
              {confirm === 'close' ? t.hk.closeTitle : t.hk.reopenTitle}
            </h3>
            <p className="text-sm text-muted mt-1.5">{confirm === 'close' ? t.hk.closeText : t.hk.reopenText}</p>
            {confirm === 'close' && (
              <>
                <div className="mt-3 rounded-xl bg-app border border-line px-3 py-2.5 text-sm text-ink tabular-nums flex flex-wrap gap-x-4 gap-y-1">
                  <span>{fmtNum(grand.hours, lang, 1)} {t.hk.hoursShort}</span>
                  <span>{fmtNum(grand.apartments, lang, 1)} {t.hk.aptShort}</span>
                  <span className="text-warn">{fmtMoney(grand.bonus, lang)}</span>
                </div>
                {weekEnd >= today && (
                  <p className="mt-3 text-xs text-warn bg-warn-soft rounded-lg px-3 py-2">{t.hk.closeEarly}</p>
                )}
              </>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="flex-1 bg-app text-ink rounded-xl py-3 font-medium disabled:opacity-40"
              >
                {t.hk.cancel}
              </button>
              <button
                onClick={confirm === 'close' ? handleClose : handleReopen}
                disabled={busy}
                className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirm === 'close' ? t.hk.closeYes : t.hk.reopenYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
