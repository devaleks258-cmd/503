import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, homePathForRole } from '@/modules/core/store'
import { BootstrapScreen, LoginScreen } from '@/modules/core/AuthScreens'
import { SvRoutes, AdminRoutes } from '@/modules/registry'
import { useI18n } from '@/i18n'
import { Package } from 'lucide-react'
import { ToastContainer } from '@/lib/toast'

function App() {
  const { t, lang } = useI18n()
  const state = useAuth((s) => s.state)
  const init = useAuth((s) => s.init)
  const profile = useAuth((s) => s.profile)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  let content: React.ReactNode
  if (state === 'loading') {
    content = (
      <div className="min-h-screen bg-app flex flex-col items-center justify-center" data-theme="dark">
        <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mb-4 animate-pulse">
          <Package className="w-7 h-7 text-white" />
        </div>
        <p className="text-sm text-muted">{t.app.loading}</p>
      </div>
    )
  } else if (state === 'bootstrap') {
    content = <BootstrapScreen />
  } else if (state === 'login' || !profile) {
    content = <LoginScreen />
  } else {
    const home = homePathForRole(profile.role)
    content = (
      <BrowserRouter>
        <Routes>
          <Route path="/sv/*" element={<SvRoutes />} />
          <Route path="/admin/*" element={<AdminRoutes />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <>
      {content}
      <ToastContainer />
    </>
  )
}

export default App
