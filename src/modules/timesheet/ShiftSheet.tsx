import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock, Loader2, Lock, Moon, Search, Trash2, X, Check } from 'lucide-react'
import { useI18n } from '@/i18n'
import { toast } from '@/lib/toast'
import type { HkApartment, HkLine, HkShift, HkStaff } from '@/lib/database.types'
import { deleteShift, saveShift } from '@/modules/timesheet/api'
import { fmtDayMonth, fmtDuration, fmtLongDate, fmtNum, hhmm, minutesBetween } from '@/modules/timesheet/lib'
import { TypeChip, hkErrorText } from '@/modules/timesheet/ui'

interface Props {
  staff: HkStaff
  date: string
  shift: HkShift | null
  shiftLines: HkLine[]
  dayLines: HkLine[]
  staffNames: Map<number, string>
  apartments: HkApartment[]
  prevShift: HkShift | null
  readOnly: boolean
  onClose: () => void
  onChanged: () => void
}

interface Sel {
  apartment_id: number
  bonus: string
}

const parseBonus = (v: string): number => (v.trim() === '' ? 0 : Number(v.trim().replace(',', '.')))

export function ShiftSheet(p: Props) {
  const { t, lang, n } = useI18n()
  const [start, setStart] = useState(p.shift ? hhmm(p.shift.start_time) : '')
  const [end, setEnd] = useState(p.shift ? hhmm(p.shift.end_time) : '')
  const [sel, setSel] = useState<Sel[]>(() =>
    p.shiftLines.map((l) => ({ apartment_id: l.apartment_id, bonus: Number(l.bonus) > 0 ? String(Number(l.bonus)) : '' })),
  )
  const [note, setNote] = useState(p.shift?.note ?? '')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { onClose } = p
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const aptById = useMemo(() => new Map(p.apartments.map((a) => [a.id, a])), [p.apartments])

  // кто ещё в этот день убирает те же квартиры (для долей)
  const others = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const l of p.dayLines) {
      if (l.staff_id === p.staff.id) continue
      const arr = m.get(l.apartment_id) ?? []
      arr.push(p.staffNames.get(l.staff_id) ?? '—')
      m.set(l.apartment_id, arr)
    }
    return m
  }, [p.dayLines, p.staff.id, p.staffNames])

  const hasTimes = start !== '' && end !== '' && start !== end
  const minutes = hasTimes ? minutesBetween(start, end) : 0
  const overnight = hasTimes && end < start
  const bonusOk = sel.every((s) => {
    const v = parseBonus(s.bonus)
    return Number.isFinite(v) && v >= 0
  })
  const canSave = hasTimes && bonusOk && !saving

  const selectedIds = useMemo(() => new Set(sel.map((s) => s.apartment_id)), [sel])
  const q = query.trim().toLowerCase()
  const available = useMemo(
    () =>
      p.apartments
        .filter((a) => a.status === 'active' && !selectedIds.has(a.id))
        .filter((a) => q === '' || a.code.toLowerCase().includes(q) || a.building.toLowerCase().includes(q))
        .slice(0, 40),
    [p.apartments, selectedIds, q],
  )

  const copyPrev = () => {
    if (!p.prevShift) return
    setStart(hhmm(p.prevShift.start_time))
    setEnd(hhmm(p.prevShift.end_time))
  }
  const showCopy =
    !p.readOnly && p.prevShift !== null && (start !== hhmm(p.prevShift.start_time) || end !== hhmm(p.prevShift.end_time))

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await saveShift({
        staffId: p.staff.id,
        date: p.date,
        start,
        end,
        note: note.trim() || null,
        apartments: sel.map((s) => ({ apartment_id: s.apartment_id, bonus: parseBonus(s.bonus) })),
      })
      toast(t.hk.saved, 'success')
      p.onChanged()
    } catch (e) {
      setError(hkErrorText(t, e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    setError(null)
    try {
      await deleteShift(p.staff.id, p.date)
      toast(t.hk.removed, 'success')
      p.onChanged()
    } catch (e) {
      setError(hkErrorText(t, e))
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full bg-app rounded-xl border border-line text-ink focus:border-accent focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 anim-scrim" onClick={p.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface rounded-t-2xl max-h-[92vh] overflow-y-auto anim-sheet w-full max-w-lg mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--line)' }} />
        </div>
        <div className="px-5 py-3 flex items-start justify-between gap-3 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink truncate">{p.staff.full_name}</h2>
            <p className="text-sm text-muted">{n(fmtLongDate(p.date, lang))}</p>
          </div>
          <button onClick={p.onClose} className="p-1 -m-1" aria-label={t.common.close}>
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {p.readOnly && (
            <div className="flex items-center gap-2 bg-warn-soft text-warn rounded-xl px-3 py-2.5 text-sm">
              <Lock className="w-4 h-4 shrink-0" />
              {t.hk.readOnly}
            </div>
          )}

          {/* рабочее время */}
          <section>
            <h3 className="text-sm font-medium text-ink mb-2">{t.hk.workTime}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-muted mb-1">{t.hk.start}</span>
                <input
                  type="time"
                  dir="ltr"
                  value={start}
                  disabled={p.readOnly}
                  onChange={(e) => setStart(e.target.value)}
                  className={`${inputCls} text-center text-2xl font-semibold tabular-nums py-3 disabled:opacity-70`}
                />
              </label>
              <label className="block">
                <span className="block text-xs text-muted mb-1">{t.hk.end}</span>
                <input
                  type="time"
                  dir="ltr"
                  value={end}
                  disabled={p.readOnly}
                  onChange={(e) => setEnd(e.target.value)}
                  className={`${inputCls} text-center text-2xl font-semibold tabular-nums py-3 disabled:opacity-70`}
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 min-h-[28px]">
              {hasTimes && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent text-sm font-medium px-3 py-1">
                  <Clock className="w-3.5 h-3.5" />
                  {fmtDuration(minutes, lang, t.hk.hoursShort, t.hk.minShort)}
                </span>
              )}
              {overnight && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft text-warn text-xs font-medium px-2.5 py-1">
                  <Moon className="w-3.5 h-3.5" />
                  {t.hk.overnight}
                </span>
              )}
              {showCopy && p.prevShift && (
                <button
                  onClick={copyPrev}
                  className="text-xs text-accent border border-line rounded-full px-3 py-1 hover:bg-accent-soft transition-colors"
                >
                  {n(
                    t.hk.sameAs
                      .replace('{d}', fmtDayMonth(p.prevShift.work_date, lang))
                      .replace('{range}', `${hhmm(p.prevShift.start_time)}–${hhmm(p.prevShift.end_time)}`),
                  )}
                </button>
              )}
            </div>
          </section>

          {/* квартиры */}
          <section>
            <h3 className="text-sm font-medium text-ink mb-2">{t.hk.aptsTitle}</h3>
            {sel.length === 0 ? (
              <p className="text-sm text-muted">{t.hk.noAptsSelected}</p>
            ) : (
              <ul className="space-y-2">
                {sel.map((s) => {
                  const apt = aptById.get(s.apartment_id)
                  const co = others.get(s.apartment_id) ?? []
                  return (
                    <li key={s.apartment_id} className="rounded-xl border border-line bg-app px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink" dir="ltr">{apt?.code ?? `#${s.apartment_id}`}</span>
                        {apt && <TypeChip type={apt.type} />}
                        <span className="flex-1" />
                        {co.length > 0 && (
                          <span className="text-xs font-medium text-warn bg-warn-soft rounded-full px-2 py-0.5">
                            {t.hk.share} {fmtNum(1 / (co.length + 1), lang, 2)}
                          </span>
                        )}
                        {!p.readOnly && (
                          <button
                            onClick={() => setSel((prev) => prev.filter((x) => x.apartment_id !== s.apartment_id))}
                            className="p-1 -m-1 text-muted hover:text-bad"
                            aria-label={t.hk.removeApt}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {co.length > 0 && (
                        <p className="text-xs text-muted mt-1">{t.hk.alsoCleaning.replace('{names}', co.join(', '))}</p>
                      )}
                      <label className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted flex-1">
                          {t.hk.bonusLabel}
                          <span className="block text-[11px] opacity-80">{t.hk.bonusHint}</span>
                        </span>
                        <input
                          inputMode="decimal"
                          dir="ltr"
                          value={s.bonus}
                          disabled={p.readOnly}
                          placeholder="0"
                          onChange={(e) =>
                            setSel((prev) =>
                              prev.map((x) => (x.apartment_id === s.apartment_id ? { ...x, bonus: e.target.value } : x)),
                            )
                          }
                          className={`${inputCls} w-28 text-end tabular-nums px-3 py-2 disabled:opacity-70 ${
                            Number.isFinite(parseBonus(s.bonus)) && parseBonus(s.bonus) >= 0 ? '' : 'border-[var(--bad)]'
                          }`}
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}

            {!p.readOnly && (
              <div className="mt-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.hk.searchApt}
                    className={`${inputCls} ps-9 pe-3 py-2.5 text-sm`}
                  />
                </div>
                <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-line divide-y divide-[var(--line)]">
                  {available.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted">{t.hk.noAptsFound}</p>
                  ) : (
                    available.map((a) => {
                      const co = others.get(a.id)
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSel((prev) => [...prev, { apartment_id: a.id, bonus: '' }])}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-start hover:bg-app transition-colors"
                        >
                          <span className="font-medium text-ink" dir="ltr">{a.code}</span>
                          <TypeChip type={a.type} />
                          <span className="flex-1 text-xs text-muted truncate">{a.building}</span>
                          {co && co.length > 0 && (
                            <span className="text-[11px] text-warn bg-warn-soft rounded-full px-2 py-0.5 shrink-0">
                              {co.length === 1 ? co[0] : `+${co.length}`}
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </section>

          {/* комментарий */}
          {(!p.readOnly || note) && (
            <section>
              <label className="block text-sm font-medium text-ink mb-2">{t.hk.note}</label>
              <textarea
                value={note}
                disabled={p.readOnly}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.hk.notePlaceholder}
                rows={2}
                className={`${inputCls} px-3 py-2.5 text-sm resize-none disabled:opacity-70`}
              />
            </section>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-bad-soft border border-line rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-bad mt-0.5 shrink-0" />
              <p className="text-sm text-bad">{error}</p>
            </div>
          )}
        </div>

        <div
          className="sticky bottom-0 bg-surface border-t border-line px-5 pt-3 flex gap-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {p.readOnly ? (
            <button onClick={p.onClose} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">
              {t.common.close}
            </button>
          ) : confirmDelete ? (
            <>
              <p className="flex-1 self-center text-sm text-ink">{t.hk.removeConfirm}</p>
              <button onClick={() => setConfirmDelete(false)} className="bg-app text-ink rounded-xl px-4 py-3 font-medium">
                {t.hk.cancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="bg-bad text-white rounded-xl px-4 py-3 font-medium disabled:opacity-40 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.hk.removeYes}
              </button>
            </>
          ) : (
            <>
              {p.shift && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-xl border border-line px-4 py-3 text-bad"
                  aria-label={t.hk.remove}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t.hk.save}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
