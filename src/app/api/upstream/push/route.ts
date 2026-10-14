import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { ingestInbound } from '@/lib/ingest'

/**
 * HTTP_PUSH receiver for the upstream supplier connector
 * ("SMPP binds and HTTP MO pushes to your SMSC originate from this IP").
 * Accepts the connector credentials (basic auth or ?token=) — logged raw even on auth failure.
 */

function checkAuth(req: NextRequest, user: string, pass: string) {
  const header = req.headers.get('authorization') || ''
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
      const idx = decoded.indexOf(':')
      const u = decoded.slice(0, idx)
      const p = decoded.slice(idx + 1)
      if (u === user && p === pass) return true
    } catch {
      return false
    }
  }
  const token = req.nextUrl.searchParams.get('token') || ''
  return token === `${user}:${pass}`
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let payload: Record<string, any> = {}
  try {
    payload = JSON.parse(raw)
  } catch {
    const fs = new URLSearchParams(raw)
    if (fs.toString()) payload = Object.fromEntries(fs.entries())
  }

  const s = await getSettings()
  const authed = checkAuth(req, s.upstream_smpp_system_id || '', s.upstream_smpp_password || '')

  await db.rawEvent
    .create({ data: { source: 'HTTP_PUSH', payload: raw.slice(0, 4000), processed: authed, note: `auth ok=${authed}` } })
    .catch(() => {})

  if (!authed) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const to = payload.to ?? payload.destination ?? payload.recipient ?? payload.msisdn ?? ''
  const from = payload.from ?? payload.source ?? payload.originator ?? payload.sender ?? ''
  const text = payload.text ?? payload.message ?? payload.content ?? payload.body ?? ''
  const id = payload.id ?? payload.message_id ?? undefined
  const simulated = payload.simulated === true
  const segments = Number(payload.segments ?? 0) || undefined
  const ts = payload.received_at ?? payload.timestamp
  const receivedAt = ts ? new Date(ts) : undefined

  if (!to) return Response.json({ ok: false, error: 'missing destination' }, { status: 422 })

  const res = await ingestInbound({ channel: 'HTTP_PUSH', to: String(to), from: String(from), text: String(text), upstreamId: id ? String(id) : undefined, simulated, segments, receivedAt })
  return Response.json({ ok: true, ingest: res.status })
}

export async function GET() {
  return Response.json({ ok: true, receiver: 'http-push' })
}
