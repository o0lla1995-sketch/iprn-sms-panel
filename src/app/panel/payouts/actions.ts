'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings } from '@/lib/settings'

export async function requestPayout(formData: FormData) {
  const session = await getSession()
  if (!session || session.role === 'ADMIN') return { ok: false, error: 'Payouts are for users and agents' }
  const me = await db.user.findUnique({ where: { id: session.uid } })
  if (!me) return { ok: false, error: 'Account error' }

  const settings = await getSettings()
  const amount = Number(formData.get('amount') || 0)
  const method = String(formData.get('method') || '').trim().slice(0, 300)
  const minPayout = Number(settings.min_payout || 200)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Invalid amount' }
  if (amount < minPayout) return { ok: false, error: `Minimum payout is ${minPayout}` }
  if (amount > me.walletBalance) return { ok: false, error: 'Insufficient balance' }

  const pending = await db.payoutRequest.findFirst({ where: { userId: session.uid, status: 'PENDING' } })
  if (pending) return { ok: false, error: 'A request is already pending' }

  const weeklyFee = Number(settings.weekly_factoring_percent || 30)
  const feePercent = me.payoutSchedule === 'WEEKLY' ? weeklyFee : 0
  const fee = +((amount * feePercent) / 100).toFixed(4)
  const net = +(amount - fee).toFixed(4)

  await db.$transaction(async (tx) => {
    const fresh = await tx.user.update({
      where: { id: session.uid },
      data: { walletBalance: { decrement: amount }, payoutMethod: method || me.payoutMethod },
    })
    const payout = await tx.payoutRequest.create({
      data: {
        userId: session.uid, amount, feePercent, fee, net,
        schedule: me.payoutSchedule, method: method || me.payoutMethod, status: 'PENDING',
      },
    })
    await tx.transaction.create({
      data: {
        userId: session.uid, type: 'PAYOUT', amount: -amount,
        balanceAfter: fresh.walletBalance, payoutId: payout.id, note: 'payout request — funds held',
      },
    })
  })

  await db.auditLog.create({
    data: { actorId: session.uid, actorEmail: session.email, action: 'PAYOUT_REQUEST', entity: 'PayoutRequest', detail: `${amount} net ${net} (${me.payoutSchedule})` },
  })
  revalidatePath('/panel/payouts')
  revalidatePath('/panel/wallet')
  return { ok: true }
}

async function adminOnly() {
  const s = await getSession()
  if (!s || s.role !== 'ADMIN') throw new Error('Admin only')
  return s
}

export async function decidePayout(formData: FormData) {
  const session = await adminOnly()
  const id = String(formData.get('id') || '')
  const decision = String(formData.get('decision') || '')
  const note = String(formData.get('note') || '').slice(0, 300)
  const payout = await db.payoutRequest.findUnique({ where: { id } })
  if (!payout) return { ok: false, error: 'Not found' }

  if (decision === 'approve' && payout.status === 'PENDING') {
    await db.payoutRequest.update({ where: { id }, data: { status: 'APPROVED', adminNote: note || payout.adminNote, processedAt: new Date() } })
  } else if (decision === 'paid' && (payout.status === 'APPROVED' || payout.status === 'PENDING')) {
    await db.payoutRequest.update({ where: { id }, data: { status: 'PAID', adminNote: note || payout.adminNote, processedAt: new Date() } })
  } else if (decision === 'reject' && (payout.status === 'PENDING' || payout.status === 'APPROVED')) {
    await db.$transaction(async (tx) => {
      const fresh = await tx.user.update({
        where: { id: payout.userId },
        data: { walletBalance: { increment: payout.amount } },
      })
      await tx.payoutRequest.update({ where: { id }, data: { status: 'REJECTED', adminNote: note || payout.adminNote, processedAt: new Date() } })
      await tx.transaction.create({
        data: {
          userId: payout.userId, type: 'PAYOUT_REFUND', amount: payout.amount,
          balanceAfter: fresh.walletBalance, payoutId: payout.id, note: note || 'rejected — funds returned',
        },
      })
    })
  } else {
    return { ok: false, error: 'Invalid transition' }
  }

  await db.auditLog.create({
    data: { actorId: session.uid, actorEmail: session.email, action: `PAYOUT_${decision.toUpperCase()}`, entity: 'PayoutRequest', entityId: id, detail: `amount ${payout.amount} ${note}` },
  })
  revalidatePath('/panel/payouts')
  return { ok: true }
}
