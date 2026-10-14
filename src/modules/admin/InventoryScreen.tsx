import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchOpenInventory,
  startInventory,
  fetchInventoryLines,
  setInventoryActual,
  closeInventory,
  cancelInventory,
  fetchWarehouseStock,
} from '@/modules/admin/api'
import type { InventoryLineRow, InventoryCloseResult, InventoryScope, WarehouseStockRow } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatQty } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { ArrowLeft, Plus, Minus, Check, X, Loader as Loader2, ClipboardCheck, Search } from 'lucide-react'

interface Props {
  scope: InventoryScope
  apartmentId?: number
  apartmentCode?: string
}

export function InventoryScreen({ scope, apartmentId, apartmentCode }: Props) {
  const { t, n } = useI18n()
  const navigate = useNavigate()
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [lines, setLines] = useState<InventoryLineRow[]>([])
  const [stock, setStock] = useState<WarehouseStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [rejectItems, setRejectItems] = useState<number[]>([])
  const [result, setResult] = useState<InventoryCloseResult | null>(null)
  const [showAddFound, setShowAddFound] = useState(false)
  const [search, setSearch] = useState('')

  const loadLines = (invId: string) => {
    fetchInventoryLines(invId)
      .then(setLines)
      .catch((e) => toast(errorMessage(e), 'error'))
  }

  useEffect(() => {
    Promise.all([
      fetchOpenInventory(scope, apartmentId),
      fetchWarehouseStock(),
    ])
      .then(async ([openInv, wh]) => {
        setStock(wh)
        if (openInv) {
          setInventoryId(openInv.id)
          loadLines(openInv.id)
        }
      })
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [scope, apartmentId])

  const handleStart = async () => {
    setStarting(true)
    try {
      const id = await startInventory(scope, apartmentId)
      setInventoryId(id)
      loadLines(id)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setStarting(false)
    }
  }

  const handleActualChange = (itemId: number, newActual: number) => {
    if (newActual < 0) return
    setLines((prev) => prev.map((l) => l.item_id === itemId ? { ...l, actual: newActual } : l))
    if (inventoryId) {
      setInventoryActual(inventoryId, itemId, newActual).catch((e) => toast(errorMessage(e), 'error'))
    }
  }

  const toggleReject = (itemId: number) => {
    setRejectItems((prev) => prev.includes(itemId) ? prev.filter((i) => i !== itemId) : [...prev, itemId])
  }

  const handleAcceptAll = async () => {
    if (!inventoryId) return
    setClosing(true)
    try {
      const res = await closeInventory(inventoryId, rejectItems)
      setResult(res)
      toast(t.admin.inventory.resultTitle, 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setClosing(false)
    }
  }

  const handleCancel = async () => {
    if (!inventoryId) return
    if (!confirm(t.admin.inventory.cancelConfirm)) return
    setCancelling(true)
    try {
      await cancelInventory(inventoryId)
      toast(t.admin.inventory.statusVoid, 'success')
      navigate(-1)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setCancelling(false)
    }
  }

  const handleAddFound = (item: WarehouseStockRow) => {
    if (!inventoryId) return
    setInventoryActual(inventoryId, item.item_id, 0)
      .then(() => {
        loadLines(inventoryId)
        setShowAddFound(false)
        setSearch('')
      })
      .catch((e) => toast(errorMessage(e), 'error'))
  }

  const lineItemMeta = (line: InventoryLineRow) => ({
    base_unit: line.base_unit,
    pack_size: line.pack_size,
    pack_label: line.pack_label,
  })

  const filteredAddItems = useMemo(() => {
    const existingIds = new Set(lines.map((l) => l.item_id))
    return stock
      .filter((s) => !existingIds.has(s.item_id))
      .filter((s) => s.name.toLowerCase().includes(search.toLowerCase().trim()))
      .slice(0, 20)
  }, [stock, lines, search])

  const title = scope === 'apartment'
    ? `${t.admin.inventory.apartment}${apartmentCode ? ' ' + apartmentCode : ''}`
    : t.admin.inventory.warehouse

  const backPath = scope === 'apartment' && apartmentId
    ? `/admin/apartments/${apartmentId}`
    : '/admin/stock'

  if (loading) {
    return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>
  }

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(backPath)} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-muted" />
        </button>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
      </div>

      {!inventoryId && !result && (
        <div className="flex flex-col items-center justify-center py-16">
          <ClipboardCheck className="w-12 h-12 text-muted mb-4" />
          <p className="text-sm text-muted mb-4">{t.admin.inventory.noItems}</p>
          <button
            onClick={handleStart}
            disabled={starting}
            className="bg-accent text-white rounded-xl px-6 py-3 font-medium flex items-center gap-2 disabled:opacity-40"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-5 h-5" />}
            {t.admin.inventory.start}
          </button>
        </div>
      )}

      {inventoryId && !result && (
        <>
          <div className="space-y-2 mb-4">
            {lines.length === 0 && (
              <p className="text-sm text-muted text-center mt-8">{t.admin.inventory.noItems}</p>
            )}
            {lines.map((line) => {
              const changed = line.actual !== line.expected
              const rejected = rejectItems.includes(line.item_id)
              return (
                <div
                  key={line.id}
                  className={`bg-surface rounded-xl border px-4 py-3 transition-colors ${
                    rejected ? 'border-bad opacity-60' : changed ? 'border-accent bg-accent-soft' : 'border-line'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ink">{line.item_name}</span>
                    {changed && !rejected && (
                      <span className="text-xs text-accent font-medium">{t.admin.inventory.changed}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted">
                      {t.admin.inventory.expected}: {n(formatQty(line.expected, lineItemMeta(line)))}
                    </div>
                    <div className="flex items-center bg-app rounded-lg ml-auto">
                      <button
                        onClick={() => handleActualChange(line.item_id, Math.max(0, line.actual - 1))}
                        className="px-2 py-1.5"
                      >
                        <Minus className="w-3.5 h-3.5 text-muted" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.actual}
                        onChange={(e) => handleActualChange(line.item_id, Number(e.target.value) || 0)}
                        className="w-16 bg-transparent text-center text-sm py-1.5 focus:outline-none"
                      />
                      <button
                        onClick={() => handleActualChange(line.item_id, line.actual + 1)}
                        className="px-2 py-1.5"
                      >
                        <Plus className="w-3.5 h-3.5 text-muted" />
                      </button>
                    </div>
                  </div>
                  {changed && (
                    <button
                      onClick={() => toggleReject(line.item_id)}
                      className={`mt-2 text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors ${
                        rejected ? 'bg-bad-soft text-bad' : 'text-muted hover:text-bad'
                      }`}
                    >
                      <X className="w-3 h-3" />
                      {t.admin.inventory.reject}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setShowAddFound(true)}
            className="w-full bg-surface border border-line rounded-xl py-3 text-sm text-accent font-medium flex items-center justify-center gap-2 hover:bg-app transition-colors mb-4"
          >
            <Plus className="w-4 h-4" />
            {t.admin.inventory.addFound}
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 bg-bad-soft text-bad rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t.admin.inventory.cancel}
            </button>
            <button
              onClick={handleAcceptAll}
              disabled={closing}
              className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t.admin.inventory.acceptAll}
            </button>
          </div>
        </>
      )}

      {/* Result sheet */}
      {result && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={() => navigate(backPath)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-t-2xl max-md:rounded-b-none max-md:anim-sheet">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">{t.admin.inventory.resultTitle}</h2>
              <button onClick={() => navigate(backPath)} className="p-1">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            {result.doc_number && (
              <p className="text-sm text-muted mb-3">{t.common.document}: {n(result.doc_number)}</p>
            )}
            {result.shortages.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-bad mb-2">{t.admin.inventory.shortages}</p>
                <div className="bg-bad-soft rounded-lg border border-line divide-y divide-[var(--line)]">
                  {result.shortages.map((it) => (
                    <div key={it.item_id} className="px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-ink">{it.name}</span>
                      <span className="text-sm text-bad">−{n(String(it.qty))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.surpluses.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-ok mb-2">{t.admin.inventory.surpluses}</p>
                <div className="bg-ok-soft rounded-lg border border-line divide-y divide-[var(--line)]">
                  {result.surpluses.map((it) => (
                    <div key={it.item_id} className="px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-ink">{it.name}</span>
                      <span className="text-sm text-ok">+{n(String(it.qty))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.shortages.length === 0 && result.surpluses.length === 0 && (
              <p className="text-sm text-muted text-center py-4">{t.admin.inventory.allInPlace}</p>
            )}
            <button onClick={() => navigate(backPath)} className="w-full bg-app text-ink rounded-lg py-3 font-medium text-sm">
              OK
            </button>
          </div>
        </>
      )}

      {/* Add found item modal */}
      {showAddFound && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={() => setShowAddFound(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-t-2xl max-md:rounded-b-none max-md:anim-sheet max-md:max-h-[85vh] max-md:overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">{t.admin.inventory.addFound}</h2>
              <button onClick={() => setShowAddFound(false)} className="p-1">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.admin.stock.search}
                className="w-full bg-app rounded-lg pl-10 pr-4 py-2.5 text-sm border border-line focus:border-accent focus:outline-none"
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filteredAddItems.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">{t.common.noResults}</p>
              ) : (
                filteredAddItems.map((item) => (
                  <button
                    key={item.item_id}
                    onClick={() => handleAddFound(item)}
                    className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-app border-b border-line last:border-0"
                  >
                    <span className="text-sm text-ink">{item.name}</span>
                    <Plus className="w-4 h-4 text-accent shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
