import type { AptType } from '@/lib/database.types'
import type { Dict } from '@/i18n/ru'
import { useI18n } from '@/i18n'

const typeStyle: Record<AptType, string> = {
  studio: 'bg-ok-soft text-ok',
  '1br': 'bg-accent-soft text-accent',
  '2br': 'bg-warn-soft text-warn',
}

export function TypeChip({ type }: { type: AptType }) {
  const { t } = useI18n()
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${typeStyle[type]}`}>
      {t.hk.aptType[type]}
    </span>
  )
}

/** Коды ошибок из RPC (hk_week_closed и т.п.) → текст на языке интерфейса. */
export function hkErrorText(t: Dict, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const map = t.hk.errors as Record<string, string>
  return map[msg] ?? msg
}
