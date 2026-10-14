import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { ingestInbound } from '@/lib/ingest'

/**
 * Receiver for the upstream platform's vendor-copy MO webhook.
 * The panel sets this URL (with its secret path segment) on the platform via
 * PUT /v1/account/mo-webhook. Payloads carry role:"vendor_copy" and may carry
 * simulated:true for test traffic (zero-rated).
 */

function extract(body: Record<string, unknown>) {
  const b = body as Record<string, any>
  const to = b.to ?? b.destination ?? b.recipient ?? b.msisdn ?? b.dialed ?? b.number ?? ''
  const from = b.from ?? b.source ?? b.originator ?? b.sender ?? b.src ?? ''
  const text = b.text ?? b.message ?? b.content ?? b.body ?? b.sms ?? ''
  const id = b.id ?? b.message_id ?? b.msg_id ?? b.uuid ?? undefined
  const simulated = b.simulated === true || b.test === true
  const segments = Number(b.segments ?? b.seg ?? b.segment_count ?? 0) || undefined
  const ts = b.received_at ?? b.timestamp ?? b.when ?? undefined
  const receivedAt = ts ? new Date(ts) : undefined
  return { to: String(to), from: String(from), text: String(text), id: id ? String(id) : undefined, simulated, segments, receivedAt }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params
  const expected = await getSetting('mo_webhook_secret', '')
  const raw = await req.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(raw)
  } catch {
    // tolerate form-encoded
    const fs = new URLSearchParams(raw)
    if (fs.toString()) {
      payload = Object.fromEntries(fs.entries())
    }
  }

  await db.rawEvent
    .create({
      data: {
        source: 'MO_WEBHOOK',
        payload: raw.slice(0, 4000),
        note: `secret ok=${secret === expected}`,
      },
    })
    .catch(() => {})

  if (!expected || secret !== expected) {
    return Response.json({ ok: false, error: 'invalid secret' }, { status: 403 })
  }

  const { to, from, text, id, simulated, segments, receivedAt } = extract(payload)
  if (!to) return Response.json({ ok: false, error: 'missing destination' }, { status: 422 })

  const res = await ingestInbound({ channel: 'WEBHOOK', to, from, text, upstreamId: id, simulated, segments, receivedAt })
  return Response.json({ ok: true, ingest: res.status, id: res.status === 'created' ? res.id : res.status === 'duplicate' ? res.id : undefined })
}

export async function GET() {
  return Response.json({ ok: true, receiver: 'mo-webhook' })
}
