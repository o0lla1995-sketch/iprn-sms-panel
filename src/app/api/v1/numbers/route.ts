import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authApiKey, json } from '@/lib/apikey'
import { trafficState } from '@/lib/format'

export async function GET(req: NextRequest) {
  const user = await authApiKey(req)
  if (!user) return json({ ok: false, error: 'invalid x-api-key' }, 401)

  const available = req.nextUrl.searchParams.get('available') === '1'
  const isAdmin = user.role === 'ADMIN'

  if (available) {
    const rows = await db.did.findMany({ where: { status: 'AVAILABLE' }, orderBy: { number: 'asc' }, take: 500 })
    return json({
      ok: true,
      data: rows.map((d) => ({
        number: d.number,
        destination: d.destination,
        model: d.model,
        class: d.class,
        // user-facing rate only — never the true rate
        your_rate_per_message: Number((d.trueRate * (1 - user.marginPercent / 100)).toFixed(4)),
      })),
    })
  }

  const where = isAdmin ? {} : { assignedUserId: user.id }
  const rows = await db.did.findMany({ where, orderBy: { number: 'asc' }, take: 1000 })
  return json({
    ok: true,
    data: rows.map((d) => {
      const t = trafficState(d.lastTrafficAt, d.assignedAt)
      return {
        number: d.number,
        destination: d.destination,
        status: d.status,
        assigned: d.assignedUserId ? true : false,
        class: d.class,
        your_rate_per_message: Number((d.trueRate * (1 - (d.assignedUserId === user.id ? user.marginPercent : user.marginPercent) / 100)).toFixed(4)),
        ...(isAdmin ? { true_rate: d.trueRate, margin_percent_on_owner: null } : {}),
        last_traffic: d.lastTrafficAt,
        traffic_left: t.label,
        traffic_level: t.level,
      }
    }),
  })
}
