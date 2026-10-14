import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authApiKey, json } from '@/lib/apikey'
import { getNumber } from '@/lib/settings'

export async function POST(req: NextRequest) {
  const user = await authApiKey(req)
  if (!user) return json({ ok: false, error: 'invalid x-api-key' }, 401)

  const { amount, method } = await req.json().catch(() => ({}))
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return json({ ok: false, error: 'invalid amount' }, 422)

  const minPayout = await getNumber('min_payout', 200)
  if (amt < minPayout) return json({ ok: false, error: `below minimum payout of ${minPayout}` }, 422)
  if (amt > user.walletBalance) return json({ ok: false, error: 'insufficient balance' }, 422)

  const pending = await db.payoutRequest.findFirst({ where: { userId: user.id, status: 'PENDING' } })
  if (pending) return json({ ok: false, error: 'a payout request is already pending' }, 409)

  const weeklyFee = await getNumber('weekly_factoring_percent', 30)
  const feePercent = user.payoutSchedule === 'WEEKLY' ? weeklyFee : 0
  const fee = Number(((amt * feePercent) / 100).toFixed(4))
  const net = Number((amt - fee).toFixed(4))

  const created = await db.$transaction(async (tx) => {
    const fresh = await tx.user.update({ where: { id: user.id }, data: { walletBalance: { decrement: amt } } })
    const payout = await tx.payoutRequest.create({
      data: {
        userId: user.id,
        amount: amt,
        feePercent,
        fee,
        net,
        schedule: user.payoutSchedule,
        method: method ? String(method).slice(0, 300) : user.payoutMethod,
        status: 'PENDING',
      },
    })
    await tx.transaction.create({
      data: {
        userId: user.id,
        type: 'PAYOUT',
        amount: -amt,
        balanceAfter: fresh.walletBalance,
        payoutId: payout.id,
        note: 'payout request — funds held',
      },
    })
    return payout
  })

  return json({ ok: true, data: { id: created.id, amount: amt, fee, net, schedule: created.schedule } })
}
