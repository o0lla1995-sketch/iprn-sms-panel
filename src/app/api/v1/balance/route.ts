import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authApiKey, json } from '@/lib/apikey'

export async function GET(req: NextRequest) {
  const user = await authApiKey(req)
  if (!user) return json({ ok: false, error: 'invalid x-api-key' }, 401)

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 25), 100)
  const txs = await db.transaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return json({
    ok: true,
    data: {
      balance: Number(user.walletBalance.toFixed(4)),
      payout_schedule: user.payoutSchedule,
      transactions: txs.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balance_after: t.balanceAfter,
        note: t.note,
        at: t.createdAt,
      })),
    },
  })
}
