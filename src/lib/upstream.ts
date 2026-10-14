import 'server-only'
import { getSetting } from '@/lib/settings'

/**
 * Thin client for the upstream wholesale platform (sms.carefulsupport.com).
 * Documented HTTP API: POST /v1/send, PUT /v1/account/mo-webhook {mo_url},
 * auth header x-api-key.
 */
export interface UpstreamResult {
  ok: boolean
  status: number
  body: string
}

export async function upstreamFetch(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<UpstreamResult> {
  const base = (await getSetting('upstream_base_url', 'https://sms.carefulsupport.com')).replace(/\/+$/, '')
  const key = await getSetting('upstream_api_key', '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(base + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        ...((init.headers as Record<string, string>) || {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    })
    const body = await res.text()
    return { ok: res.ok, status: res.status, body: body.slice(0, 2000) }
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message || 'network error' }
  } finally {
    clearTimeout(timer)
  }
}

/** Point the platform's vendor-copy MO webhook at this panel (or clear it with null). */
export async function setMoWebhook(url: string | null): Promise<UpstreamResult> {
  return upstreamFetch('/v1/account/mo-webhook', {
    method: 'PUT',
    body: JSON.stringify({ mo_url: url ?? '' }),
  })
}

export async function testUpstreamConnection(): Promise<UpstreamResult> {
  return upstreamFetch('/', { method: 'GET' }, 8000)
}
