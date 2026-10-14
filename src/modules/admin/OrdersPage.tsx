import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchPurchaseOrders, poGenerate } from '@/modules/admin/api'
import type { PurchaseOrderRow, POStatus } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { formatDateTime } from '@/lib/format'
import { toast, errorMessage } from '@/lib/toast'
import { ArrowLeft, ClipboardCheck, ChevronRight, Sparkles, Loader as Loader2, Truck, PackageCheck, FileText } from 'lucide-react'

const statusColors: Record<POStatus, string> = {
  draft: 'bg-warn-soft text-warn',
  sent: 'bg-accent-soft text-accent',
  received: 'bg-ok-soft text-ok',
  cancelled: 'bg-bad-soft text-bad',
}

export function OrdersPage() {
  const { t, n } = useI18n()
  const navigate = useNavigate()
  const [tab, setTab] = useState<POStatus>('draft')
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetchPurchaseOrders(tab)
      .then(setOrders)
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [tab])

  useEffect(() => { load() }, [load])

  const statusLabels: Record<POStatus, string> = {
    draft: t.admin.orders.statusDraft,
    sent: t.admin.orders.statusSent,
    received: t.admin.orders.statusReceived,
    cancelled: t.admin.orders.statusCancelled,
  }

  const tabs: Array<{ key: POStatus; label: string; icon: typeof FileText }> = [
    { key: 'draft', label: t.admin.orders.drafts, icon: FileText },
    { key: 'sent', label: t.admin.orders.sent, icon: Truck },
    { key: 'received', label: t.admin.orders.received, icon: PackageCheck },
  ]

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await poGenerate()
      if (result.length === 0) {
        toast(t.admin.orders.nothingToOrder, 'info')
      } else {
        toast(`${t.admin.orders.generated}: ${n(String(result.length))}`, 'success')
        load()
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="px-4 pt-5 pb-28 lg:px-0 lg:pt-0">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/admin/more')} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-muted" />
        </button>
        <h1 className="text-xl font-semibold text-ink">{t.admin.orders.title}</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="inline-flex bg-surface border border-line rounded-lg p-0.5 flex-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-sm transition-colors ${
                tab === key ? 'bg-accent text-white' : 'text-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'draft' && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full bg-accent text-white rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 mb-4 transition-opacity hover:opacity-90"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {t.admin.orders.generate}
        </button>
      )}

      {loading ? (
        <div className="text-center text-muted text-sm pt-8">{t.app.loading}</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <ClipboardCheck className="w-10 h-10 mb-3" />
          <p className="text-sm">{t.admin.orders.noOrders}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => navigate(`/admin/more/orders/${order.id}`)}
              className="w-full bg-surface border border-line rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:border-accent transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{order.number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status]}`}>
                    {statusLabels[order.status]}
                  </span>
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {order.supplier ?? t.admin.orders.noSupplier}
                  {' · '}
                  {n(formatDateTime(order.created_at))}
                </div>
                <div className="text-xs text-muted">
                  {t.admin.orders.lines}: {n(String(order.lines))}
                  {order.est_cost != null && ` · ${t.admin.orders.estCost}: ${n(String(order.est_cost))} EGP`}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
