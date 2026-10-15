import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { supabaseConfigMissing } from './lib/supabase';

// Перезагрузка после обновления service worker не должна стирать несохранённый ввод (лист смены, формы):
// если открыт диалог или идёт ввод — откладываем до следующего открытия приложения.
function reloadWhenIdle() {
  const busy = document.querySelector('[role="dialog"]') || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
  if (!busy) window.location.reload()
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            reloadWhenIdle()
          }
        })
      })
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    }).catch(() => {})
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      reloadWhenIdle()
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigMissing ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: '1.125rem', color: '#1e293b' }}>
        Не заданы переменные VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в настройках хостинга
      </div>
    ) : (
      <App />
    )}
  </StrictMode>
);
