import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import type { LiveMessage } from '@/app/panel/traffic/types'

/**
 * Lightweight live-poll endpoint for the Traffic page LIVE mode.
 * Same filters & role scoping as the page; `since` (ISO timestamp) marks rows
 * that arrived after the client's last poll so they can be highlighted.
 * Non-admin roles receive derived earnings only — never margin/true fields.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').toLowerCase()
  const cls = url.searchParams.get('class') || ''
  const days = Number(url.searchParams.get('days') || 7) || 7
  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : null
  const watermark = since && !isNaN(since.getTime()) ? since : null

  const where: Record<string, unknown> = { deletedAt: null }
  if (days > 0 && days < 3650) where.receivedAt = { gte: new Date(Date.now() - days * 86400000) }
  if (cls === 'P2P' || cls === 'A2P') where.class = cls
  if (q) where.OR = [{ numberFrom: { contains: q } }, { numberTo: { contains: q } }]

  if (session.role === 'USER') where.userId = session.uid
  if (session.role === 'AGENT') {
    const kids = await db.user.findMany({ where: { parentId: session.uid }, select: { id: true } })
    where.userId = { in: [...kids.map((k) => k.id), session.uid] }
  }

  const rows = await db.message.findMany({
    where,
    include: { did: { select: { destination: true } }, user: { select: { name: true } } },
    orderBy: { receivedAt: 'desc' },
    take: 200,
  })

  const isAdmin = session.role === 'ADMIN'
  const data: LiveMessage[] = rows.map((m) => ({
    id: m.id,
    receivedAt: m.receivedAt.toISOString(),
    numberFrom: m.numberFrom,
    numberTo: m.numberTo,
    destination: m.did?.destination ?? null,
    class: m.class,
    segments: m.segments,
    channel: m.channel,
    simulated: m.simulated,
    carriedBy: m.carriedBy,
    upstreamId: m.upstreamId ? m.upstreamId.slice(0, 10) : null,
    text: m.text,
    userName: isAdmin ? (m.user?.name ?? null) : null,
    userEarning: m.userEarning,
    ...(isAdmin ? { trueCost: m.trueCost, marginKept: m.marginKept, billingStatus: m.billingStatus } : {}),
    isNew: watermark ? m.receivedAt > watermark : false,
  }))

  return Response.json({ ok: true, serverTime: new Date().toISOString(), rows: data })
}
