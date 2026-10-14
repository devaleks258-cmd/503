import { useState, useEffect, useRef, useMemo } from 'react'
import { fetchItems, fetchApartmentsAdmin, updateItem } from '@/modules/admin/api'
import type { Item, Apartment } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { renderQrDataUrl, itemCode, apartmentCode } from '@/lib/qr'
import { Search, Printer, Check, X, Package, Building2 } from 'lucide-react'

type Selection =
  | { kind: 'item'; id: number; label: string; code: string }
  | { kind: 'apartment'; id: number; label: string; code: string }

export function QRLabelsPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<Item[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'items' | 'apartments'>('items')
  const [selected, setSelected] = useState<Selection[]>([])
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([fetchItems(), fetchApartmentsAdmin()])
      .then(([it, apts]) => {
        setItems(it.filter((i) => i.active))
        setApartments(apts)
      })
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [])

  const isSelected = (id: number, kind: 'item' | 'apartment') =>
    selected.some((s) => s.kind === kind && s.id === id)

  const toggleSelect = (sel: Selection) => {
    setSelected((prev) =>
      prev.some((s) => s.kind === sel.kind && s.id === sel.id)
        ? prev.filter((s) => !(s.kind === sel.kind && s.id === sel.id))
        : [...prev, sel],
    )
  }

  const filteredItems = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase().trim())).slice(0, 50),
    [items, search],
  )

  const filteredApartments = useMemo(
    () => apartments.filter((a) => a.code.toLowerCase().includes(search.toLowerCase().trim())).slice(0, 50),
    [apartments, search],
  )

  // Generate QR data URLs for selected items and ensure qr_code is set
  useEffect(() => {
    selected.forEach((sel) => {
      if (qrUrls[sel.code]) return
      renderQrDataUrl(sel.code, 200).then((url) => {
        setQrUrls((prev) => ({ ...prev, [sel.code]: url }))
      })
    })
  }, [selected, qrUrls])

  // Auto-assign qr_code for items that don't have it
  const ensureQrCode = async (item: Item) => {
    if (item.qr_code) return item
    const code = itemCode(item.id)
    try {
      await updateItem(item.id, { qr_code: code })
      return { ...item, qr_code: code }
    } catch (e) {
      toast(errorMessage(e), 'error')
      return item
    }
  }

  const handleAddItem = async (item: Item) => {
    const updated = await ensureQrCode(item)
    const code = updated.qr_code ?? itemCode(item.id)
    toggleSelect({ kind: 'item', id: item.id, label: item.name, code })
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="flex items-center justify-between mb-4 no-print">
        <h1 className="text-xl font-semibold text-ink">{t.admin.qrLabels.title}</h1>
        {selected.length > 0 && (
          <button
            onClick={handlePrint}
            className="bg-accent text-white rounded-xl px-3 py-2 flex items-center gap-1.5 text-sm font-medium"
          >
            <Printer className="w-4 h-4" />
            {t.admin.qrLabels.print} ({selected.length})
          </button>
        )}
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 no-print">
          {selected.map((s) => (
            <span key={`${s.kind}-${s.id}`} className="inline-flex items-center gap-1 bg-accent-soft text-accent rounded-full px-2.5 py-1 text-xs font-medium">
              {s.label}
              <button onClick={() => toggleSelect(s)} className="hover:text-bad">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex bg-surface border border-line rounded-lg p-0.5 mb-3 no-print">
        <button
          onClick={() => { setTab('items'); setSearch('') }}
          className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${tab === 'items' ? 'bg-accent text-white' : 'text-muted'}`}
        >
          <Package className="w-3.5 h-3.5" />
          {t.admin.qrLabels.items}
        </button>
        <button
          onClick={() => { setTab('apartments'); setSearch('') }}
          className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${tab === 'apartments' ? 'bg-accent text-white' : 'text-muted'}`}
        >
          <Building2 className="w-3.5 h-3.5" />
          {t.admin.qrLabels.apartments}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3 no-print">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.admin.stock.search}
          className="w-full bg-surface rounded-lg pl-10 pr-4 py-2 text-sm border border-line focus:border-accent focus:outline-none"
        />
      </div>

      {/* List */}
      <div className="space-y-1.5 no-print max-h-[40vh] overflow-y-auto">
        {tab === 'items'
          ? filteredItems.map((item) => {
              const sel = isSelected(item.id, 'item')
              return (
                <button
                  key={item.id}
                  onClick={() => handleAddItem(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    sel ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-app'
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${sel ? 'bg-accent' : 'border border-line'}`}>
                    {sel && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className="text-sm text-ink flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-muted shrink-0">{itemCode(item.id)}</span>
                </button>
              )
            })
          : filteredApartments.map((apt) => {
              const sel = isSelected(apt.id, 'apartment')
              return (
                <button
                  key={apt.id}
                  onClick={() => toggleSelect({ kind: 'apartment', id: apt.id, label: apt.code, code: apartmentCode(apt.id) })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    sel ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-app'
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${sel ? 'bg-accent' : 'border border-line'}`}>
                    {sel && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className="text-sm text-ink flex-1 truncate">{apt.code}</span>
                  <span className="text-xs text-muted shrink-0">{apartmentCode(apt.id)}</span>
                </button>
              )
            })}
      </div>

      {/* Print area */}
      {selected.length > 0 && (
        <div ref={printRef} className="print-area hidden print:block mt-4">
          <div className="grid grid-cols-3 gap-2">
            {selected.map((s) => (
              <div key={`${s.kind}-${s.id}`} className="border border-black p-2 flex flex-col items-center text-center">
                {qrUrls[s.code] ? (
                  <img src={qrUrls[s.code]} alt={s.code} className="w-32 h-32" />
                ) : (
                  <div className="w-32 h-32 bg-gray-200 flex items-center justify-center text-xs text-gray-400">QR</div>
                )}
                <p className="text-xs font-semibold mt-1 text-black truncate w-full">{s.label}</p>
                <p className="text-[10px] text-gray-600">{s.code}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
