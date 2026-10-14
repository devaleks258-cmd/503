import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { fetchWarehouseStock, fetchCleaningReport, fetchMovesReport } from '@/modules/admin/api'
import type { ReportMoveRow } from '@/modules/admin/api'
import type { WarehouseStockRow, BaseUnit, Apartment, Item } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatDateTime, formatQty, formatNum } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { ArrowLeft, FileDown, Loader as Loader2 } from 'lucide-react'

type PeriodPreset = 'today' | '7d' | '30d' | 'custom'
type ReportTab = 'cleaning' | 'warehouse' | 'moves'

const cairoTz = 'Africa/Cairo'

function startOfCairoDayISO(): string {
  const now = new Date()
  const cairoStr = now.toLocaleString('en-US', { timeZone: cairoTz })
  const cairoDate = new Date(cairoStr)
  cairoDate.setHours(0, 0, 0, 0)
  const utc = new Date(cairoDate.getTime() - cairoDate.getTimezoneOffset() * 60000)
  return utc.toISOString()
}

function endOfCairoDayISO(): string {
  const start = new Date(startOfCairoDayISO())
  start.setDate(start.getDate() + 1)
  return start.toISOString()
}

function daysAgoISO(days: number): string {
  const start = new Date(startOfCairoDayISO())
  start.setDate(start.getDate() - (days - 1))
  return start.toISOString()
}

function localDateInputValue(iso: string): string {
  const d = new Date(iso)
  const cairoStr = d.toLocaleString('en-CA', { timeZone: cairoTz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return cairoStr
}

function downloadCSV(filename: string, rows: string[][]) {
  const BOM = '\uFEFF'
  const csv = BOM + rows.map((r) => r.map((c) => {
    const s = String(c ?? '')
    if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function fmtMoney(v: number | null): string {
  if (v == null) return '—'
  return formatNum(v, { maximumFractionDigits: 2 })
}

function fmtQtyCSV(qty: number, packSize: number, packLabel: string, unit: BaseUnit, units: Record<BaseUnit, string>): string {
  if (packSize > 1) {
    const packs = qty / packSize
    return `${packs.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${packLabel} (${Math.round(qty)} ${units[unit]})`
  }
  return `${qty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${units[unit]}`
}

export function ReportsPage() {
  const { t, n } = useI18n()
  const navigate = useNavigate()
  const [tab, setTab] = useState<ReportTab>('cleaning')
  const [preset, setPreset] = useState<PeriodPreset>('7d')
  const [customFrom, setCustomFrom] = useState(localDateInputValue(daysAgoISO(7)))
  const [customTo, setCustomTo] = useState(localDateInputValue(startOfCairoDayISO()))
  const [loading, setLoading] = useState(false)

  // Moves filters
  const [filterItemId, setFilterItemId] = useState<number | null>(null)
  const [filterAptId, setFilterAptId] = useState<number | null>(null)
  const [filterSource, setFilterSource] = useState<string | null>(null)

  const [apartments, setApartments] = useState<Apartment[]>([])
  const [items, setItems] = useState<Item[]>([])

  // Data
  const [cleaningMoves, setCleaningMoves] = useState<ReportMoveRow[]>([])
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockRow[]>([])
  const [movesData, setMovesData] = useState<ReportMoveRow[]>([])

  useEffect(() => {
    supabase.from('apartments').select('id,building_id,number,code,type,status,created_at').order('code')
      .then(({ data, error }) => { if (!error) setApartments(data ?? []) })
    supabase.from('items').select('id,category_id,name,base_unit,pack_size,pack_label,min_stock,track_on_hand,qr_code,photo_path,active,sort,supplier_id').order('name')
      .then(({ data, error }) => { if (!error) setItems(data ?? []) })
  }, [])

  const dateRange = useMemo(() => {
    if (preset === 'today') return { from: startOfCairoDayISO(), to: endOfCairoDayISO() }
    if (preset === '7d') return { from: daysAgoISO(7), to: endOfCairoDayISO() }
    if (preset === '30d') return { from: daysAgoISO(30), to: endOfCairoDayISO() }
    // custom
    const fromISO = new Date(customFrom + 'T00:00:00+02:00').toISOString()
    const toISO = new Date(customTo + 'T23:59:59+02:00').toISOString()
    return { from: fromISO, to: toISO }
  }, [preset, customFrom, customTo])

  const loadCleaning = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCleaningReport(dateRange.from, dateRange.to)
      setCleaningMoves(data)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [dateRange.from, dateRange.to])

  const loadWarehouse = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchWarehouseStock()
      setWarehouseStock(data)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMoves = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchMovesReport({
        from: dateRange.from,
        to: dateRange.to,
        itemId: filterItemId,
        apartmentId: filterAptId,
        sourceType: filterSource,
      })
      setMovesData(data)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [dateRange.from, dateRange.to, filterItemId, filterAptId, filterSource])

  useEffect(() => {
    if (tab === 'cleaning') loadCleaning()
    else if (tab === 'warehouse') loadWarehouse()
    else if (tab === 'moves') loadMoves()
  }, [tab, loadCleaning, loadWarehouse, loadMoves])

  // Group cleaning moves by apartment then item
  const cleaningGrouped = useMemo(() => {
    const map = new Map<string, { aptCode: string; rows: ReportMoveRow[]; totalCost: number }>()
    for (const m of cleaningMoves) {
      const key = m.apartment_code ?? `#${m.apartment_id ?? '?'}`
      const entry = map.get(key) ?? { aptCode: key, rows: [] as ReportMoveRow[], totalCost: 0 }
      entry.rows.push(m)
      if (m.unit_cost != null) entry.totalCost += m.qty * m.unit_cost
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.aptCode.localeCompare(b.aptCode))
  }, [cleaningMoves])

  const cleaningTotalCost = useMemo(() => cleaningGrouped.reduce((s, g) => s + g.totalCost, 0), [cleaningGrouped])

  const handleExportCleaning = () => {
    const u = t.common.units
    const rows: string[][] = [[t.admin.reports.apartment, t.admin.reports.item, t.admin.reports.qty, t.admin.reports.cost]]
    for (const g of cleaningGrouped) {
      for (const r of g.rows) {
        const isReversal = r.source_type === 'cleaning_reversal'
        rows.push([
          g.aptCode,
          r.item_name,
          (isReversal ? '−' : '') + fmtQtyCSV(r.qty, r.pack_size, r.pack_label, r.base_unit, u),
          r.unit_cost != null ? fmtMoney(r.qty * r.unit_cost) : t.admin.reports.noUnitCost,
        ])
      }
    }
    downloadCSV('cleaning_report.csv', rows)
  }

  const handleExportWarehouse = () => {
    const u = t.common.units
    const rows: string[][] = [[t.admin.stock.title, t.admin.reports.qty, t.admin.stock.min, t.common.status]]
    for (const s of warehouseStock) {
      rows.push([
        s.name,
        fmtQtyCSV(s.qty, s.pack_size, s.pack_label, s.base_unit, u),
        s.min_stock != null ? String(s.min_stock) : '—',
        s.below_min ? t.admin.reports.belowMin : t.admin.reports.inStock,
      ])
    }
    downloadCSV('warehouse_report.csv', rows)
  }

  const handleExportMoves = () => {
    const u = t.common.units
    const st = t.admin.stock.sourceTypes
    const rows: string[][] = [[t.admin.reports.movedAt, t.admin.reports.item, t.admin.reports.qty, t.admin.reports.source, t.admin.reports.fromLoc, t.admin.reports.toLoc, t.admin.reports.cost, t.admin.reports.author, t.admin.reports.note]]
    for (const m of movesData) {
      rows.push([
        formatDateTime(m.moved_at),
        m.item_name,
        fmtQtyCSV(m.qty, m.pack_size, m.pack_label, m.base_unit, u),
        st[m.source_type as keyof typeof st] ?? m.source_type,
        m.from_location?.name ?? '—',
        m.to_location?.name ?? '—',
        m.unit_cost != null ? fmtMoney(m.qty * m.unit_cost) : t.admin.reports.noUnitCost,
        m.author ?? '—',
        m.note ?? '',
      ])
    }
    downloadCSV('moves_report.csv', rows)
  }

  const sourceTypeOptions = Object.keys(t.admin.stock.sourceTypes)

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/admin/more')} className="p-1 -ml-1 lg:hidden">
          <ArrowLeft className="w-5 h-5 text-muted" />
        </button>
        <h1 className="text-xl font-semibold text-ink">{t.admin.reports.title}</h1>
      </div>

      {/* Tab selector */}
      <div className="inline-flex bg-surface border border-line rounded-lg p-0.5 mb-4">
        {([
          { key: 'cleaning', label: t.admin.reports.tabCleaning },
          { key: 'warehouse', label: t.admin.reports.tabWarehouse },
          { key: 'moves', label: t.admin.reports.tabMoves },
        ] as { key: ReportTab; label: string }[]).map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3 py-2 rounded-md text-sm transition-colors ${tab === tb.key ? 'bg-accent text-white font-medium' : 'text-muted'}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Period selector (cleaning & moves only) */}
      {tab !== 'warehouse' && (
        <div className="mb-4 space-y-2">
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'today', label: t.admin.reports.today },
              { key: '7d', label: t.admin.reports.days7 },
              { key: '30d', label: t.admin.reports.days30 },
              { key: 'custom', label: t.admin.reports.custom },
            ] as { key: PeriodPreset; label: string }[]).map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm border transition-colors ${preset === p.key ? 'bg-accent border-accent text-white' : 'bg-surface border-line text-muted'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-surface rounded-lg px-3 py-2 text-sm border border-line focus:border-accent focus:outline-none"
              />
              <span className="text-muted text-sm">{t.admin.reports.to}</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-surface rounded-lg px-3 py-2 text-sm border border-line focus:border-accent focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Moves filters */}
      {tab === 'moves' && (
        <div className="flex gap-2 flex-wrap mb-4">
          <select
            value={filterItemId ?? ''}
            onChange={(e) => setFilterItemId(e.target.value ? Number(e.target.value) : null)}
            className="bg-surface rounded-lg px-3 py-2 text-sm border border-line focus:border-accent focus:outline-none"
          >
            <option value="">{t.admin.reports.allItems}</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select
            value={filterAptId ?? ''}
            onChange={(e) => setFilterAptId(e.target.value ? Number(e.target.value) : null)}
            className="bg-surface rounded-lg px-3 py-2 text-sm border border-line focus:border-accent focus:outline-none"
          >
            <option value="">{t.admin.reports.allApartments}</option>
            {apartments.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
          </select>
          <select
            value={filterSource ?? ''}
            onChange={(e) => setFilterSource(e.target.value || null)}
            className="bg-surface rounded-lg px-3 py-2 text-sm border border-line focus:border-accent focus:outline-none"
          >
            <option value="">{t.admin.reports.allSources}</option>
            {sourceTypeOptions.map((s) => <option key={s} value={s}>{t.admin.stock.sourceTypes[s as keyof typeof t.admin.stock.sourceTypes]}</option>)}
          </select>
        </div>
      )}

      {/* Export button */}
      <div className="mb-4">
        <button
          onClick={tab === 'cleaning' ? handleExportCleaning : tab === 'warehouse' ? handleExportWarehouse : handleExportMoves}
          disabled={loading || (tab === 'cleaning' && cleaningMoves.length === 0) || (tab === 'warehouse' && warehouseStock.length === 0) || (tab === 'moves' && movesData.length === 0)}
          className="flex items-center gap-2 bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 transition-opacity hover:opacity-90"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          {t.admin.reports.export}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center text-muted text-sm pt-8">{t.app.loading}</div>
      ) : tab === 'cleaning' ? (
        cleaningGrouped.length === 0 ? (
          <p className="text-sm text-muted text-center mt-8">{t.admin.reports.noData}</p>
        ) : (
          <div className="space-y-5">
            {cleaningGrouped.map((g) => (
              <div key={g.aptCode}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="font-semibold text-sm text-ink">{g.aptCode}</h2>
                  {g.totalCost > 0 && <span className="text-xs text-muted">{t.admin.reports.totalCost}: {n(fmtMoney(g.totalCost))}</span>}
                </div>
                <div className="bg-surface border border-line rounded-xl overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.item}</th>
                        <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.qty}</th>
                        <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.cost}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => {
                        const isReversal = r.source_type === 'cleaning_reversal'
                        return (
                          <tr key={r.id} className="hover:bg-app transition-colors">
                            <td className="px-3 py-2.5 border-b border-line">
                              <span className={`text-sm ${isReversal ? 'text-bad' : 'text-ink'}`}>{r.item_name}</span>
                              {isReversal && <span className="text-xs text-bad ml-1">({t.admin.stock.sourceTypes.cleaning_reversal})</span>}
                            </td>
                            <td className="px-3 py-2.5 border-b border-line">
                              <span className={isReversal ? 'text-bad' : 'text-ink'}>{isReversal ? '−' : ''}{n(formatQty(r.qty, { base_unit: r.base_unit, pack_size: r.pack_size, pack_label: r.pack_label }))}</span>
                            </td>
                            <td className="px-3 py-2.5 border-b border-line">
                              <span className="text-muted text-sm">{r.unit_cost != null ? n(fmtMoney(r.qty * r.unit_cost)) : t.admin.reports.noUnitCost}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {cleaningTotalCost > 0 && (
              <div className="bg-surface border border-line rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-sm text-ink">{t.admin.reports.totalCost}</span>
                <span className="font-semibold text-ink">{n(fmtMoney(cleaningTotalCost))}</span>
              </div>
            )}
          </div>
        )
      ) : tab === 'warehouse' ? (
        warehouseStock.length === 0 ? (
          <p className="text-sm text-muted text-center mt-8">{t.admin.reports.noData}</p>
        ) : (
          <div className="bg-surface border border-line rounded-xl overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.stock.title}</th>
                  <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.qty}</th>
                  <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.stock.min}</th>
                  <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {warehouseStock.map((s) => (
                  <tr key={s.item_id} className="hover:bg-app transition-colors">
                    <td className="px-3 py-2.5 border-b border-line">
                      <span className="text-sm text-ink">{s.name}</span>
                      <span className="text-xs text-muted block">{s.category}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-line">
                      <span className={s.below_min ? 'text-bad font-medium' : 'text-ink'}>{n(formatQty(s.qty, s))}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-line">
                      <span className="text-muted text-sm">{s.min_stock != null ? n(String(s.min_stock)) : '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-line">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.below_min ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok'}`}>
                        {s.below_min ? t.admin.reports.belowMin : t.admin.reports.inStock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : movesData.length === 0 ? (
        <p className="text-sm text-muted text-center mt-8">{t.admin.reports.noData}</p>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.movedAt}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.item}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.qty}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.source}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.fromLoc}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.toLoc}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.cost}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.author}</th>
                <th className="text-left font-medium text-muted text-xs px-3 py-2 border-b border-line">{t.admin.reports.note}</th>
              </tr>
            </thead>
            <tbody>
              {movesData.slice(0, 500).map((m) => {
                const st = t.admin.stock.sourceTypes
                return (
                  <tr key={m.id} className="hover:bg-app transition-colors">
                    <td className="px-3 py-2.5 border-b border-line whitespace-nowrap text-xs text-muted">{n(formatDateTime(m.moved_at))}</td>
                    <td className="px-3 py-2.5 border-b border-line text-sm text-ink">{m.item_name}</td>
                    <td className="px-3 py-2.5 border-b border-line text-sm text-ink">{n(formatQty(m.qty, { base_unit: m.base_unit, pack_size: m.pack_size, pack_label: m.pack_label }))}</td>
                    <td className="px-3 py-2.5 border-b border-line text-xs text-muted">{st[m.source_type as keyof typeof st] ?? m.source_type}</td>
                    <td className="px-3 py-2.5 border-b border-line text-xs text-muted">{m.from_location?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 border-b border-line text-xs text-muted">{m.to_location?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 border-b border-line text-sm text-muted">{m.unit_cost != null ? n(fmtMoney(m.qty * m.unit_cost)) : t.admin.reports.noUnitCost}</td>
                    <td className="px-3 py-2.5 border-b border-line text-xs text-muted">{m.author ?? '—'}</td>
                    <td className="px-3 py-2.5 border-b border-line text-xs text-muted max-w-32 truncate">{m.note ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {movesData.length > 500 && (
            <div className="px-4 py-2 text-xs text-muted text-center">{n(String(movesData.length))} · 500 / {t.app.loading}</div>
          )}
        </div>
      )}
    </div>
  )
}
