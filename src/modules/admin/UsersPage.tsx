import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { Plus, Trash2, Eye, EyeOff, Copy, Check, X, Lock, CreditCard as Edit3 } from 'lucide-react'

interface AdminUser {
  id: string
  login: string
  full_name: string
  active: boolean
  created_at: string
}

export function UsersPage() {
  const { t } = useI18n()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [createdCreds, setCreatedCreds] = useState<{ login: string; password: string } | null>(null)
  const [copied, setCopied] = useState<'login' | 'password' | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const load = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'list' } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setUsers(data.users ?? [])
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSetActive = async (id: string, active: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'set_active', id, active: !active } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast(active ? t.admin.users.inactive : t.admin.users.active, 'success')
      load()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t.admin.users.confirmDelete)) return
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', id } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast(t.admin.users.delete, 'success')
      load()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const copy = (text: string, what: 'login' | 'password') => {
    navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{t.admin.users.title}</h1>
        <button
          onClick={() => setAdding(true)}
          className="bg-accent text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          {t.admin.users.add}
        </button>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted text-center mt-8">{t.admin.users.noUsers}</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-surface rounded-xl border border-line px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-ink">{u.full_name}</p>
                  <p className="text-xs text-muted">{u.login}</p>
                </div>
                <button
                  onClick={() => handleSetActive(u.id, u.active)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium ${u.active ? 'bg-ok-soft text-ok' : 'bg-app text-muted'}`}
                >
                  {u.active ? t.admin.users.active : t.admin.users.inactive}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const pw = prompt(t.admin.users.setPassword)
                    if (pw && pw.length >= 8) {
                      supabase.functions.invoke('admin-users', { body: { action: 'set_password', id: u.id, password: pw } })
                        .then(({ data, error }) => {
                          if (error || data?.error) { toast(error?.message ?? data?.error, 'error'); return }
                          toast(t.admin.users.setPassword, 'success')
                        })
                    } else if (pw) {
                      toast(t.auth.bootstrapPassword, 'error')
                    }
                  }}
                  className="text-xs bg-app text-ink rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                >
                  <Lock className="w-3 h-3" />
                  {t.admin.users.setPassword}
                </button>
                <button
                  onClick={() => { setRenaming(u.id); setRenameValue(u.full_name) }}
                  className="text-xs bg-app text-ink rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3 h-3" />
                  {t.admin.users.rename}
                </button>
                <button
                  onClick={() => handleDelete(u.id)}
                  className="text-xs bg-bad-soft text-bad rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" />
                  {t.admin.users.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add user form */}
      {adding && (
        <UserCreateForm
          onClose={() => setAdding(false)}
          onCreated={(login, password) => {
            setAdding(false)
            setCreatedCreds({ login, password })
            load()
          }}
        />
      )}

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink">{t.admin.users.renameTitle}</h3>
              <button onClick={() => setRenaming(null)}><X className="w-5 h-5 text-muted" /></button>
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setRenaming(null)} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">
                {t.cleaning.cancel}
              </button>
              <button
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'rename', id: renaming, full_name: renameValue.trim() } })
                    if (error) throw error
                    if (data?.error) throw new Error(data.error)
                    toast(t.admin.users.renamed, 'success')
                    setRenaming(null)
                    load()
                  } catch (e) {
                    toast(errorMessage(e), 'error')
                  }
                }}
                disabled={!renameValue.trim()}
                className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40"
              >
                {t.admin.users.rename}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Created credentials */}
      {createdCreds && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink">{t.admin.users.credentialsTitle}</h3>
              <button onClick={() => setCreatedCreds(null)}><X className="w-5 h-5 text-muted" /></button>
            </div>
            <p className="text-sm text-warn bg-warn-soft rounded-xl px-3 py-2.5 mb-4">{t.admin.users.credentialsHint}</p>
            <div className="space-y-3">
              <div className="bg-app rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">{t.admin.users.login}</p>
                  <p className="text-sm font-medium text-ink">{createdCreds.login}</p>
                </div>
                <button onClick={() => copy(createdCreds.login, 'login')} className="text-accent">
                  {copied === 'login' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="bg-app rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">{t.admin.users.password}</p>
                  <p className="text-sm font-medium text-ink">{createdCreds.password}</p>
                </div>
                <button onClick={() => copy(createdCreds.password, 'password')} className="text-accent">
                  {copied === 'password' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button onClick={() => setCreatedCreds(null)} className="w-full mt-4 bg-accent text-white rounded-xl py-3 font-medium">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function UserCreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (login: string, password: string) => void }) {
  const { t } = useI18n()
  const [login, setLogin] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleCreate = async () => {
    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'create', login, full_name: fullName, password },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast(t.admin.users.created, 'success')
      onCreated(login, password)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-5 border border-line">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-ink">{t.admin.users.add}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-ink mb-1">{t.admin.users.login}</label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase())}
              placeholder="a-z 0-9 . _ -"
              className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1">{t.admin.users.fullName}</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1">{t.admin.users.password}</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="мин. 8 символов"
                className="w-full bg-app rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none"
              />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 bg-app text-ink rounded-xl py-3 font-medium">{t.cleaning.cancel}</button>
          <button
            onClick={handleCreate}
            disabled={submitting || !login.trim() || !fullName.trim() || password.length < 8}
            className="flex-1 bg-accent text-white rounded-xl py-3 font-medium disabled:opacity-40"
          >
            {t.admin.users.add}
          </button>
        </div>
      </div>
    </div>
  )
}
