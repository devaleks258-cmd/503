import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchInventories, fetchInventoryDetail } from '@/modules/admin/api'
import type { InventoryWithApt, InventoryLineRow, InventoryStatus, InventoryScope } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatDateTime, formatQty } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { ClipboardCheck, ChevronRight, ArrowLeft, X } from 'lucide-react'

const statusColors: Record<InventoryStatus, string> = {
  open: 'bg-warn-soft text-warn',
  closed: 'bg-ok-soft text-ok',
  void: 'bg-bad-soft text-bad',
}

export function InventoriesPage() {
  const { t, n } = useI18n()
  const navigate = useNavigate()
  const [inventories, setInventories] = useState<InventoryWithApt[]>([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)

  const statusLabels: Record<InventoryStatus, string> = {
    open: t.admin.inventory.statusOpen,
    closed: t.admin.inventory.statusClosed,
    void: t.admin.inventory.statusVoid,
  }

  const scopeLabels: Record<InventoryScope, string> = {
    apartment: t.admin.inventory.scopeApartment,
    warehouse: t.admin.inventory.scopeWarehouse,
  }

  useEffect(() => {
    fetchInventories()
      .then(setInventories)
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>
  }

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <h1 className="text-xl font-semibold text-ink mb-4">{t.admin.inventory.history}</h1>

      {inventories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <ClipboardCheck className="w-10 h-10 mb-3" />
          <p className="text-sm">{t.admin.inventory.noHistory}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {inventories.map((inv) => (
            <button
              key={inv.id}
              onClick={() => setDetailId(inv.id)}
              className="w-full bg-surface border border-line rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:border-accent transition-colors"
            >
              <ClipboardCheck className="w-5 h-5 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {scopeLabels[inv.scope]}
                    {inv.apartment_code && ` ${inv.apartment_code}`}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[inv.status]}`}>
                    {statusLabels[inv.status]}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {n(formatDateTime(inv.created_at))}
                  {inv.doc_number && ` · ${inv.doc_number}`}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}

      {detailId && (
        <InventoryDetail
          inventoryId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

function InventoryDetail({ inventoryId, onClose }: { inventoryId: string; onClose: () => void }) {
  const { t, n } = useI18n()
  const navigate = useNavigate()
  const [inventory, setInventory] = useState<InventoryWithApt | null>(null)
  const [lines, setLines] = useState<InventoryLineRow[]>([])
  const [loading, setLoading] = useState(true)

  const statusLabels: Record<InventoryStatus, string> = {
    open: t.admin.inventory.statusOpen,
    closed: t.admin.inventory.statusClosed,
    void: t.admin.inventory.statusVoid,
  }

  const scopeLabels: Record<InventoryScope, string> = {
    apartment: t.admin.inventory.scopeApartment,
    warehouse: t.admin.inventory.scopeWarehouse,
  }

  useEffect(() => {
    fetchInventoryDetail(inventoryId)
      .then(({ inventory, lines }) => {
        setInventory(inventory)
        setLines(lines)
      })
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [inventoryId])

  const lineItemMeta = (line: InventoryLineRow) => ({
    base_unit: line.base_unit,
    pack_size: line.pack_size,
    pack_label: line.pack_label,
  })

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[60] anim-scrim" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 w-full max-w-[440px] bg-surface z-[61] overflow-auto border-l border-line anim-drawer">
        {loading ? (
          <div className="p-6 text-center text-muted text-sm">{t.app.loading}</div>
        ) : !inventory ? (
          <div className="p-6 text-center text-muted text-sm">{t.common.notFound}</div>
        ) : (
          <div className="p-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} className="bg-surface border border-line text-ink rounded-lg px-3 py-1.5 text-sm font-medium">
                {t.common.close}
              </button>
            </div>
            <h2 className="text-xl font-semibold text-ink m-0">
              {scopeLabels[inventory.scope]}
              {inventory.apartment_code && ` ${inventory.apartment_code}`}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[inventory.status]}`}>
                {statusLabels[inventory.status]}
              </span>
              <span className="text-xs text-muted">{n(formatDateTime(inventory.created_at))}</span>
            </div>
            {inventory.doc_number && (
              <p className="text-sm text-muted mt-2">{t.common.document}: {n(inventory.doc_number)}</p>
            )}

            {/* Lines */}
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t.admin.inventory.lines}</h3>
              {lines.length === 0 ? (
                <p className="text-sm text-muted">{t.admin.inventory.noItems}</p>
              ) : (
                <div className="bg-surface border border-line rounded-lg divide-y divide-[var(--line)]">
                  {lines.map((line) => {
                    const delta = line.actual - line.expected
                    return (
                      <div key={line.id} className="px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink">{line.item_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            line.decision === 'accepted' ? 'bg-ok-soft text-ok'
                            : line.decision === 'rejected' ? 'bg-bad-soft text-bad'
                            : 'bg-warn-soft text-warn'
                          }`}>
                            {line.decision === 'accepted' ? t.admin.inventory.decisionAccepted
                              : line.decision === 'rejected' ? t.admin.inventory.decisionRejected
                              : t.admin.inventory.decisionPending}
                          </span>
                        </div>
                        <div className="text-xs text-muted mt-1 flex items-center gap-3">
                          <span>{t.admin.inventory.expected}: {n(formatQty(line.expected, lineItemMeta(line)))}</span>
                          <span>{t.admin.inventory.actual}: {n(formatQty(line.actual, lineItemMeta(line)))}</span>
                          {delta !== 0 && line.decision === 'accepted' && (
                            <span className={delta < 0 ? 'text-bad' : 'text-ok'}>
                              {delta < 0 ? '−' : '+'}{n(formatQty(Math.abs(delta), lineItemMeta(line)))}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
