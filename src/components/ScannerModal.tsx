import { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useI18n } from '@/i18n'
import { toast, errorMessage } from '@/lib/toast'
import { parseCode } from '@/lib/qr'
import { X, Camera, Keyboard } from 'lucide-react'

interface ScannerModalProps {
  onClose: () => void
  onScanItem: (itemId: number) => void
  onScanApartment: (aptId: number) => void
}

export function ScannerModal({ onClose, onScanItem, onScanApartment }: ScannerModalProps) {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerId = 'qr-scanner-container'
  const handledRef = useRef(false)

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        await scannerRef.current.clear()
      } catch {
        // ignore
      }
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => { void stopScanner() }
  }, [stopScanner])

  const handleResult = useCallback((raw: string) => {
    if (handledRef.current) return
    const parsed = parseCode(raw)
    if (!parsed) {
      toast(t.scanner.unknownCode, 'error')
      return
    }
    handledRef.current = true
    void stopScanner()
    if (parsed.kind === 'item') {
      onScanItem(parsed.id)
    } else {
      onScanApartment(parsed.id)
    }
    onClose()
  }, [onScanItem, onScanApartment, onClose, stopScanner, t])

  const startCamera = useCallback(async () => {
    setError(null)
    handledRef.current = false
    try {
      const scanner = new Html5Qrcode(containerId, { verbose: false })
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (_decodedText: string, _decodedResult: unknown) => handleResult(_decodedText),
        () => {},
      )
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [handleResult])

  useEffect(() => {
    if (!manualMode) {
      void startCamera()
    } else {
      void stopScanner()
    }
  }, [manualMode, startCamera, stopScanner])

  const handleClose = () => {
    void stopScanner()
    onClose()
  }

  const handleManualSubmit = () => {
    const val = manualValue.trim()
    if (!val) return
    handleResult(val)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-ink flex items-center gap-2">
            <Camera className="w-5 h-5 text-accent" />
            {t.scanner.title}
          </h3>
          <button onClick={handleClose} className="w-8 h-8 bg-app rounded-lg flex items-center justify-center">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {!manualMode ? (
          <>
            <div id={containerId} className="w-full aspect-square rounded-xl overflow-hidden bg-black mb-3" />
            {error && (
              <div className="space-y-3">
                <p className="text-sm text-bad text-center">{t.scanner.cameraError}</p>
                <button
                  onClick={() => setManualMode(true)}
                  className="w-full bg-app text-ink rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Keyboard className="w-4 h-4" />
                  {t.scanner.manualEntry}
                </button>
              </div>
            )}
            {!error && (
              <button
                onClick={() => setManualMode(true)}
                className="w-full text-sm text-muted flex items-center justify-center gap-1.5"
              >
                <Keyboard className="w-3.5 h-3.5" />
                {t.scanner.manualEntry}
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <input
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder={t.scanner.manualPlaceholder}
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit() }}
              className="w-full bg-app rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualValue.trim()}
              className="w-full bg-accent text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {t.scanner.manualSubmit}
            </button>
            <button
              onClick={() => { setManualMode(false); setManualValue('') }}
              className="w-full text-sm text-muted flex items-center justify-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              {t.scanner.backToCamera}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
