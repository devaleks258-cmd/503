import { useState, useEffect } from 'react'
import { fetchSettings, updateSetting } from '@/modules/admin/api'
import type { SettingRow } from '@/modules/admin/api'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { Check, Loader as Loader2 } from 'lucide-react'

export function SettingsPage() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<SettingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings()
      .then((rows) => {
        setSettings(rows)
        const map: Record<string, string> = {}
        for (const r of rows) map[r.key] = r.value
        setEditValues(map)
      })
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (key: string) => {
    const val = editValues[key]
    if (val === undefined) return
    setSavingKey(key)
    try {
      await updateSetting(key, val)
      toast(t.admin.settings.saved, 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  const keyLabel = (key: string): string => {
    if (key === 'currency') return t.admin.settings.currency
    return key
  }

  return (
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-xl font-semibold text-ink mb-4">{t.admin.settings.title}</h1>

      {settings.length === 0 ? (
        <p className="text-sm text-muted text-center mt-8">—</p>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => (
            <div key={s.key} className="bg-surface rounded-xl border border-line px-4 py-3">
              <label className="block text-xs text-muted mb-1.5">{keyLabel(s.key)}</label>
              <div className="flex items-center gap-2">
                <input
                  value={editValues[s.key] ?? ''}
                  onChange={(e) => setEditValues({ ...editValues, [s.key]: e.target.value })}
                  className="flex-1 bg-app rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                />
                <button
                  onClick={() => handleSave(s.key)}
                  disabled={savingKey === s.key || editValues[s.key] === s.value}
                  className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center disabled:opacity-40 shrink-0"
                >
                  {savingKey === s.key ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
