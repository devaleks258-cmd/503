import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchPurchaseOrder,
  fetchPurchaseOrderLines,
  poSetLine,
  poSetStatus,
  poReceive,
  fetchItems,
} from '@/modules/admin/api'
import type { PurchaseOrderRow, POLineRow, POStatus, Item, BaseUnit } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatQty, formatDateTime } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { ArrowLeft, Send, X, Printer, Plus, Check, Loader as Loader2, Search, MessageCircle } from 'lucide-react'

const statusColors: Record<POStatus, string> = {
  draft: 'bg-warn-soft text-warn',
  sent: 'bg-accent-soft text-accent',
  received: 'bg-ok-soft text-ok',
  cancelled: 'bg-bad-soft text-bad',
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, n } = useI18n()
  const [order, setOrder] = useState<PurchaseOrderRow | null>(null)
  const [lines, setLines] = useState<POLineRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [search, setSearch] = useState('')
  const [receiveLines, setReceiveLines] = useState<Array<{ item_id: number; qty: number; unit_cost: number | null }>>([])
  const [receiveResult, setReceiveResult] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetchPurchaseOrder(id),
      fetchPurchaseOrderLines(id),
      fetchItems(),
    ])
      .then(([ord, lns, its]) => {
        setOrder(ord)
        setLines(lns)
        setItems(its)
      })
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [id])

  const statusLabels: Record<POStatus, string> = {
    draft: t.admin.orders.statusDraft,
    sent: t.admin.orders.statusSent,
    received: t.admin.orders.statusReceived,
    cancelled: t.admin.orders.statusCancelled,
  }

  const isDraft = order?.status === 'draft'
  const isSent = order?.status === 'sent'

  const refreshLines = () => {
    if (!id) return
    fetchPurchaseOrderLines(id).then(setLines).catch((e) => toast(errorMessage(e), 'error'))
  }

  const handleLineChange = (itemId: number, field: 'qty' | 'unit_cost', value: number) => {
    setLines((prev) => prev.map((l) => l.item_id === itemId ? { ...l, [field]: value } : l))
  }

  const handleLineBlur = (itemId: number, qty: number, unitCost: number | null) => {
    if (!id) return
    poSetLine(id, itemId, qty, unitCost)
      .then(() => {
        if (qty <= 0) {
          setLines((prev) => prev.filter((l) => l.item_id !== itemId))
        }
      })
      .catch((e) => toast(errorMessage(e), 'error'))
  }

  const handleAddItem = (item: Item) => {
    if (!id) return
    poSetLine(id, item.id, 1, null)
      .then(() => {
        refreshLines()
        setShowAddItem(false)
        setSearch('')
      })
      .catch((e) => toast(errorMessage(e), 'error'))
  }

  const handleSend = async () => {
    if (!id || !order) return
    if (!confirm(t.admin.orders.sendConfirm)) return
    setActionLoading(true)
    try {
      await poSetStatus(id, 'sent')
      toast(t.admin.orders.statusSent, 'success')
      navigate('/admin/more/orders')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!id || !order) return
    if (!confirm(t.admin.orders.cancelConfirm)) return
    setActionLoading(true)
    try {
      await poSetStatus(id, 'cancelled')
      toast(t.admin.orders.statusCancelled, 'success')
      navigate('/admin/more/orders')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const openReceive = () => {
    const initial = lines
      .filter((l) => l.qty - l.received_qty > 0)
      .map((l) => ({
        item_id: l.item_id,
        qty: Number((l.qty - l.received_qty).toFixed(3)),
        unit_cost: l.unit_cost,
      }))
    setReceiveLines(initial)
    setShowReceive(true)
  }

  const handleReceiveChange = (itemId: number, field: 'qty' | 'unit_cost', value: number) => {
    setReceiveLines((prev) => prev.map((l) => l.item_id === itemId ? { ...l, [field]: value } : l))
  }

  const handleReceive = async () => {
    if (!id) return
    setActionLoading(true)
    try {
      const filtered = receiveLines
        .filter((l) => l.qty > 0)
        .map((l) => ({ item_id: l.item_id, qty: l.qty, unit_cost: l.unit_cost ?? null }))
      const result = await poReceive(id, filtered.length > 0 ? filtered : null)
      setReceiveResult(result.doc_number ?? '')
      setShowReceive(false)
      refreshLines()
      const ord = await fetchPurchaseOrder(id)
      setOrder(ord)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleWhatsApp = () => {
    if (!order) return
    const parts: string[] = []
    parts.push(order.supplier ?? t.admin.orders.noSupplier)
    parts.push(order.number)
    parts.push('')
    for (const line of lines) {
      const packs = line.pack_size > 1 ? (line.qty / line.pack_size) : line.qty
      const packStr = line.pack_size > 1
        ? `${packs.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${t.admin.orders.packs}`
        : `${line.qty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}`
      parts.push(`${line.item_name}: ${packStr}`)
    }
    const text = encodeURIComponent(parts.join('\n'))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handlePrint = () => {
    window.print()
  }

  const filteredItems = useMemo(() => {
    const existingIds = new Set(lines.map((l) => l.item_id))
    return items
      .filter((i) => i.active && !existingIds.has(i.id))
      .filter((i) => i.name.toLowerCase().includes(search.toLowerCase().trim()))
      .slice(0, 20)
  }, [items, lines, search])

  const lineMeta = (line: POLineRow) => ({
    base_unit: line.base_unit,
    pack_size: line.pack_size,
    pack_label: line.pack_label,
  })

  if (loading) {
    return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>
  }

  if (!order) {
    return (
      <div className="px-4 pt-8 text-center text-muted">
        <p>{t.common.notFound}</p>
        <button onClick={() => navigate('/admin/more/orders')} className="mt-3 text-accent text-sm">
          {t.admin.orders.title}
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <div className="flex items-center gap-3 mb-4 no-print">
        <button onClick={() => navigate('/admin/more/orders')} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-muted" />
        </button>
        <h1 className="text-xl font-semibold text-ink flex-1">{order.number}</h1>
      </div>

      {/* Header card */}
      <div className="bg-surface border border-line rounded-xl p-4 mb-4 print-area" ref={printRef}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted">{t.admin.orders.detail}: </span>
            <span className="text-ink font-medium">{order.number}</span>
          </div>
          <div>
            <span className="text-muted">{t.admin.documents.date}: </span>
            <span className="text-ink font-medium">{formatDateTime(order.created_at)}</span>
          </div>
          <div>
            <span className="text-muted">{t.admin.documents.supplier}: </span>
            <span className="text-ink font-medium">{order.supplier ?? t.admin.orders.noSupplier}</span>
          </div>
          <div>
            <span className="text-muted">{t.admin.documents.status}: </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status]}`}>
              {statusLabels[order.status]}
            </span>
          </div>
          {order.sent_at && (
            <div>
              <span className="text-muted">{t.admin.orders.sent}: </span>
              <span className="text-ink font-medium">{formatDateTime(order.sent_at)}</span>
            </div>
          )}
          {order.received_at && (
            <div>
              <span className="text-muted">{t.admin.orders.receivedLabel}: </span>
              <span className="text-ink font-medium">{formatDateTime(order.received_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <section className="bg-surface border border-line rounded-xl p-4 mb-4 print-area">
        <h2 className="text-sm font-semibold text-ink mb-3">{t.admin.orders.lines}: {n(String(lines.length))}</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted">{t.admin.orders.noOrders}</p>
        ) : (
          <div className="space-y-2">
            {lines.map((line) => {
              const packs = line.pack_size > 1 ? line.qty / line.pack_size : null
              return (
                <div key={line.id} className="py-2.5 border-t border-line first:border-t-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-ink font-medium">{line.item_name}</span>
                    {line.received_qty > 0 && (
                      <span className="text-xs text-ok">
                        {t.admin.orders.receivedLabel}: {n(formatQty(line.received_qty, lineMeta(line)))}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {isDraft ? (
                      <>
                        <div className="flex items-center bg-app rounded-lg">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.qty}
                            onChange={(e) => handleLineChange(line.item_id, 'qty', Number(e.target.value) || 0)}
                            onBlur={() => handleLineBlur(line.item_id, line.qty, line.unit_cost)}
                            className="w-20 bg-transparent text-center text-sm py-1.5 focus:outline-none"
                          />
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={t.admin.orders.unitCost}
                          value={line.unit_cost ?? ''}
                          onChange={(e) => handleLineChange(line.item_id, 'unit_cost', Number(e.target.value) || 0)}
                          onBlur={() => handleLineBlur(line.item_id, line.qty, line.unit_cost || null)}
                          className="w-24 bg-app rounded-lg px-3 py-1.5 text-sm border border-line focus:border-accent focus:outline-none"
                        />
                        <button
                          onClick={() => handleLineBlur(line.item_id, 0, null)}
                          className="text-xs text-bad hover:underline"
                        >
                          {t.admin.orders.removeLine}
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-muted">
                        {n(formatQty(line.qty, lineMeta(line)))}
                        {line.unit_cost != null && ` · ${n(String(line.unit_cost))} EGP`}
                      </div>
                    )}
                  </div>
                  {packs != null && (
                    <div className="text-xs text-muted mt-0.5">
                      {n(packs.toLocaleString('ru-RU', { maximumFractionDigits: 1 }))} {t.admin.orders.packs}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap no-print">
        {isDraft && (
          <>
            <button
              onClick={() => setShowAddItem(true)}
              className="flex-1 bg-surface border border-line rounded-xl py-3 text-sm text-accent font-medium flex items-center justify-center gap-2 hover:bg-app transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t.admin.orders.addLine}
            </button>
            <button
              onClick={handleSend}
              disabled={actionLoading || lines.length === 0}
              className="flex-1 bg-accent text-white rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t.admin.orders.send}
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 bg-bad-soft text-bad rounded-xl py-3 text-sm font-medium disabled:opacity-40"
            >
              {t.admin.orders.cancel}
            </button>
          </>
        )}
        {isSent && (
          <>
            <button
              onClick={openReceive}
              disabled={actionLoading}
              className="flex-1 bg-accent text-white rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t.admin.orders.accept}
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 bg-bad-soft text-bad rounded-xl py-3 text-sm font-medium disabled:opacity-40"
            >
              {t.admin.orders.cancel}
            </button>
          </>
        )}
        {(isDraft || isSent) && (
          <>
            <button
              onClick={handleWhatsApp}
              className="flex-1 bg-surface border border-line rounded-xl py-3 text-sm text-ink font-medium flex items-center justify-center gap-2 hover:bg-app transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-ok" />
              {t.admin.orders.whatsapp}
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 bg-surface border border-line rounded-xl py-3 text-sm text-ink font-medium flex items-center justify-center gap-2 hover:bg-app transition-colors"
            >
              <Printer className="w-4 h-4 text-muted" />
              {t.admin.orders.print}
            </button>
          </>
        )}
      </div>

      {/* Receive result */}
      {receiveResult && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={() => setReceiveResult(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">{t.admin.orders.receivedDoc}</h2>
              <button onClick={() => setReceiveResult(null)} className="p-1">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            <p className="text-sm text-muted mb-4">{t.common.document}: {n(receiveResult)}</p>
            <button onClick={() => setReceiveResult(null)} className="w-full bg-app text-ink rounded-lg py-3 font-medium text-sm">
              OK
            </button>
          </div>
        </>
      )}

      {/* Receive sheet */}
      {showReceive && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={() => setShowReceive(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-t-2xl max-md:rounded-b-none max-md:anim-sheet max-md:max-h-[85vh] max-md:overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">{t.admin.orders.acceptTitle}</h2>
              <button onClick={() => setShowReceive(false)} className="p-1">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            <p className="text-xs text-muted mb-3">{t.admin.orders.acceptHint}</p>
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {receiveLines.map((rl) => {
                const line = lines.find((l) => l.item_id === rl.item_id)
                if (!line) return null
                const remaining = line.qty - line.received_qty
                return (
                  <div key={rl.item_id} className="border-b border-line pb-2 last:border-0">
                    <div className="text-sm text-ink font-medium mb-1">{line.item_name}</div>
                    <div className="text-xs text-muted mb-2">
                      {t.admin.orders.remaining}: {n(formatQty(remaining, lineMeta(line)))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={rl.qty}
                        onChange={(e) => handleReceiveChange(rl.item_id, 'qty', Number(e.target.value) || 0)}
                        className="w-20 bg-app rounded-lg text-center text-sm py-1.5 border border-line focus:border-accent focus:outline-none"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t.admin.orders.unitCost}
                        value={rl.unit_cost ?? ''}
                        onChange={(e) => handleReceiveChange(rl.item_id, 'unit_cost', Number(e.target.value) || 0)}
                        className="w-24 bg-app rounded-lg px-3 py-1.5 text-sm border border-line focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              onClick={handleReceive}
              disabled={actionLoading}
              className="w-full bg-accent text-white rounded-xl py-3 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t.admin.orders.acceptSelected}
            </button>
          </div>
        </>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={() => setShowAddItem(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] bg-surface rounded-2xl w-full max-w-sm p-5 border border-line max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:rounded-t-2xl max-md:rounded-b-none max-md:anim-sheet max-md:max-h-[85vh] max-md:overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">{t.admin.orders.addLine}</h2>
              <button onClick={() => setShowAddItem(false)} className="p-1">
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
              {filteredItems.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">{t.common.noResults}</p>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
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
