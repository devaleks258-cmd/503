import QRCode from 'qrcode'

export function itemCode(itemId: number): string {
  return `SKLAD-I-${itemId}`
}

export function apartmentCode(aptId: number): string {
  return `SKLAD-A-${aptId}`
}

export type ParsedCode =
  | { kind: 'item'; id: number }
  | { kind: 'apartment'; id: number }
  | null

export function parseCode(raw: string): ParsedCode {
  const s = raw.trim().toUpperCase()
  const itemMatch = s.match(/^SKLAD-I-(\d+)$/)
  if (itemMatch) return { kind: 'item', id: Number(itemMatch[1]) }
  const aptMatch = s.match(/^SKLAD-A-(\d+)$/)
  if (aptMatch) return { kind: 'apartment', id: Number(aptMatch[1]) }
  return null
}

export async function renderQrDataUrl(text: string, size = 200): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
}
