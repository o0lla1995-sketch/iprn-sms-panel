import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authApiKey, json } from '@/lib/apikey'

/** User-facing rate card — derived rates only (true upstream rates never leave the panel for non-admins). */
export async function GET(req: NextRequest) {
  const user = await authApiKey(req)
  if (!user) return json({ ok: false, error: 'invalid x-api-key' }, 401)

  const groups = await db.rateGroup.findMany({ orderBy: [{ destination: 'asc' }] })
  const margin = user.marginPercent

  return json({
    ok: true,
    data: {
      currency: 'USD',
      your_margin_class: user.payoutSchedule === 'WEEKLY' ? 'fast payout (weekly factoring fee applies)' : 'standard payout',
      rates: groups.map((g) => ({
        destination: g.destination,
        model: g.model,
        class: g.class,
        your_rate_per_message: Number((g.trueRate * (1 - margin / 100)).toFixed(4)),
        ...(user.role === 'ADMIN' ? { true_rate: g.trueRate } : {}),
      })),
    },
  })
}
