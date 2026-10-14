import { useState, useEffect } from 'react'
import { fetchSuppliers, createSupplier, updateSupplier, deleteSupplier } from '@/modules/admin/api'
import type { Supplier } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { Plus, Pencil, Trash2, X, Loader as Loader2 } from 'lucide-react'

export function SuppliersPage() {
  const { t } = useI18n()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = () => {
    fetchSuppliers()
      .then(setSuppliers)
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openAdd = () => {
    setForm({ name: '', phone: '', note: '' })
    setAdding(true)
    setEditing(null)
  }

  const openEdit = (s: Supplier) => {
    setForm({ name: s.name, phone: s.phone ?? '', note: s.note ?? '' })
    setEditing(s)
    setAdding(false)
  }

  const closeForm = () => {
    setEditing(null)
    setAdding(false)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await updateSupplier(editing.id, {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          note: form.note.trim() || null,
        })
        toast(t.admin.suppliers.updated, 'success')
      } else {
        await createSupplier(form.name.trim(), form.phone.trim() || null, form.note.trim() || null)
        toast(t.admin.suppliers.created, 'success')
      }
      closeForm()
      load()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      await deleteSupplier(id)
      toast(t.admin.suppliers.deleted, 'success')
      load()
    } catch (e) {
      const err = e as Error & { code?: string }
      if (err.code === '23503') {
        toast(t.admin.suppliers.deleteInUse, 'error')
      } else {
        toast(errorMessage(e), 'error')
      }
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  const showForm = adding || editing

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{t.admin.suppliers.title}</h1>
        <button
          onClick={openAdd}
          className="bg-accent text-white rounded-xl px-3 py-2 flex items-center gap-1.5 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t.admin.suppliers.add}
        </button>
      </div>

      {suppliers.length === 0 && !showForm ? (
        <p className="text-sm text-muted text-center mt-8">{t.admin.suppliers.noSuppliers}</p>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-surface rounded-xl border border-line px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  {s.phone && <p className="text-xs text-muted mt-0.5">{s.phone}</p>}
                  {s.note && <p className="text-xs text-muted mt-1 bg-app rounded-lg px-2.5 py-1.5">{s.note}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => openEdit(s)}
                    className="w-8 h-8 bg-app rounded-lg flex items-center justify-center"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t.admin.suppliers.confirmDelete)) handleDelete(s.id)
                    }}
                    disabled={deletingId === s.id}
                    className="w-8 h-8 bg-bad-soft rounded-lg flex items-center justify-center disabled:opacity-40"
                  >
                    {deletingId === s.id ? (
                      <Loader2 className="w-3.5 h-3.5 text-bad animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-bad" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink">
                {editing ? t.admin.suppliers.edit : t.admin.suppliers.add}
              </h3>
              <button onClick={closeForm} className="w-8 h-8 bg-app rounded-lg flex items-center justify-center">
                <X className="w-4 h-4 text-muted" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t.admin.suppliers.name}
                className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t.admin.suppliers.phone}
                className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              />
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder={t.admin.suppliers.note}
                rows={2}
                className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none"
              />
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="w-full bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t.admin.suppliers.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
