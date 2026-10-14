import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authApiKey, json } from '@/lib/apikey'

export async function GET(req: NextRequest) {
  const user = await authApiKey(req)
  if (!user) return json({ ok: false, error: 'invalid x-api-key' }, 401)

  const q = req.nextUrl.searchParams
  const since = q.get('since') ? new Date(String(q.get('since'))) : null
  const limit = Math.min(Number(q.get('limit') || 50), 200)
  const cls = q.get('class')
  const includeDeleted = q.get('deleted') === '1'

  const isAdmin = user.role === 'ADMIN'
  const where: Record<string, unknown> = {}
  if (!isAdmin) where.userId = user.id
  if (since instanceof Date && !isNaN(since.getTime())) where.receivedAt = { gte: since }
  if (cls === 'P2P' || cls === 'A2P') where.class = cls
  if (!includeDeleted) where.deletedAt = null

  const rows = await db.message.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    take: limit,
    include: { did: true },
  })

  return json({
    ok: true,
    data: rows.map((m) => ({
      id: m.id,
      to: m.numberTo,
      from: m.numberFrom,
      text: m.text,
      segments: m.segments,
      class: m.class,
      destination: m.did?.destination,
      channel: m.channel,
      simulated: m.simulated,
      carried_by: m.carriedBy,
      your_earning: m.userId === user.id || isAdmin ? m.userEarning : undefined,
      ...(isAdmin ? { true_value: m.trueCost, margin_kept: m.marginKept, billing_status: m.billingStatus } : {}),
      received_at: m.receivedAt,
    })),
  })
}
