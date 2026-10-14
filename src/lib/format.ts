export function fmtRate(n: number): string {
  return n.toFixed(4)
}

export function fmtMoney(n: number, currency = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  const v = n.toFixed(2)
  const sign = n < 0 ? '-' : ''
  return `${sign}${symbol}${Math.abs(Number(v)).toFixed(2)}`
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().slice(0, 10)
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return 'never'
  const date = typeof d === 'string' ? new Date(d) : d
  const sec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

export interface TrafficState {
  level: 'OK' | 'WARN' | 'DANGER' | 'IDLE'
  label: string
  daysLeft: number | null
}

/**
 * Upstream rule: a sourced/assigned number that receives no inbound SMS for 7 days
 * is un-sourced automatically. Platform emails 3 days before.
 */
export function trafficState(lastTrafficAt: Date | string | null | undefined, assignedAt?: Date | string | null): TrafficState {
  const ref = lastTrafficAt ?? assignedAt ?? null
  if (!ref) return { level: 'IDLE', label: 'no traffic yet', daysLeft: null }
  const date = typeof ref === 'string' ? new Date(ref) : ref
  const elapsedDays = (Date.now() - date.getTime()) / 86400000
  const daysLeft = Math.max(0, 7 - elapsedDays)
  if (elapsedDays >= 7) return { level: 'DANGER', label: '7-day limit exceeded', daysLeft: 0 }
  if (daysLeft <= 3) return { level: 'DANGER', label: `${daysLeft.toFixed(1)}d left`, daysLeft }
  if (daysLeft <= 5) return { level: 'WARN', label: `${daysLeft.toFixed(1)}d left`, daysLeft }
  return { level: 'OK', label: `${daysLeft.toFixed(1)}d left`, daysLeft }
}
