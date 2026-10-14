import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * CSV export of the traffic log (same filters & role scoping as the page).
 * "Pull" your traffic — mirrors upstream export capability.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').toLowerCase()
  const cls = url.searchParams.get('class') || ''
  const days = Number(url.searchParams.get('days') || 7)

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
    include: { did: { select: { destination: true } }, user: { select: { email: true } } },
    orderBy: { receivedAt: 'desc' },
    take: 5000,
  })

  const isAdmin = session.role === 'ADMIN'
  const esc = (v: string | number | boolean | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = [
    'received_at', 'from', 'to', 'destination', 'class', 'segments', 'channel',
    'carried_by', 'simulated', 'user_email',
    'user_earning',
    ...(isAdmin ? ['true_value', 'margin_kept', 'billing_status'] : []),
  ]
  const lines = rows.map((m) =>
    [
      m.receivedAt.toISOString(), m.numberFrom, m.numberTo, m.did?.destination ?? 'unmatched',
      m.class, m.segments, m.channel, m.carriedBy, m.simulated, m.user?.email ?? '',
      m.userEarning,
      ...(isAdmin ? [m.trueCost, m.marginKept, m.billingStatus] : []),
    ].map(esc).join(',')
  )
  const csv = [header.join(','), ...lines].join('\n')
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="traffic-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
