import 'server-only'
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { getSettings, getNumber, getBool } from '@/lib/settings'
import { computeSplit, agentCommission } from '@/lib/rates'

export interface InboundMessage {
  channel: 'SMPP' | 'WEBHOOK' | 'HTTP_PUSH' | 'IMPORT' | 'MANUAL'
  to: string
  from: string
  text: string
  segments?: number
  upstreamId?: string
  simulated?: boolean
  receivedAt?: Date
}

export type IngestResult =
  | { status: 'created'; id: string; userId: string | null; userEarning: number; trueCost: number }
  | { status: 'duplicate'; id: string }
  | { status: 'rejected'; reason: string }

/** Keep digits only, tolerate + / 00 prefixes. */
export function normalizeMsisdn(raw: string): string {
  let s = String(raw || '').replace(/[^\d]/g, '')
  if (s.startsWith('00')) s = s.slice(2)
  return s
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** Exact DID match first, then longest leading-digit block (mirrors upstream routing). */
export async function matchDid(to: string) {
  const exact = await db.did.findUnique({ where: { number: to } })
  if (exact) return exact
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM Did WHERE ${to} LIKE number || '%' ORDER BY LENGTH(number) DESC LIMIT 1`
  if (rows.length) return db.did.findUnique({ where: { id: rows[0].id } })
  return null
}

/**
 * THE pipeline: every inbound message (SMPP submit from platform, MO webhook copy,
 * HTTP push, manual/import) flows through here.
 * Idempotent via dedupHash; accounting is transactional.
 */
export async function ingestInbound(input: InboundMessage): Promise<IngestResult> {
  const to = normalizeMsisdn(input.to)
  const from = String(input.from || '').trim()
  const text = String(input.text || '')
  if (to.length < 6) return { status: 'rejected', reason: `invalid destination "${input.to}"` }

  const receivedAt = input.receivedAt ?? new Date()
  const bucket = Math.floor(receivedAt.getTime() / (5 * 60 * 1000))
  const dedupHash = input.upstreamId
    ? hash(`${input.channel}|${input.upstreamId}`)
    : hash(`${to}|${from}|${text}|${bucket}`)

  const settings = await getSettings()
  const defaultMargin = Number(settings.default_margin ?? 30)

  const did = await matchDid(to)
  const user = did?.assignedUserId
    ? await db.user.findUnique({ where: { id: did.assignedUserId } })
    : null

  const trueRate = did?.trueRate ?? 0
  const marginPercent = user?.marginPercent ?? defaultMargin
  const simulated = !!input.simulated
  const { userEarning, marginKept } = computeSplit(simulated ? 0 : trueRate, marginPercent)
  const billingStatus = simulated ? 'ZERO' : trueRate > 0 ? 'PENDING' : 'UNPRICED'
  const segments = input.segments && input.segments > 0 ? input.segments : text.length > 160 ? 2 : 1
  // class: from DID when specific, else detect by sender type (alphanumeric = A2P app, numeric = P2P person)
  const cls =
    did && did.class !== 'BOTH' ? did.class : /[a-zA-Z]/.test(from) ? 'A2P' : 'P2P'

  const agent = user?.parentId ? await db.user.findUnique({ where: { id: user.parentId } }) : null
  const commission = !simulated && agent ? agentCommission(userEarning, agent.agentCommissionPercent) : 0

  try {
    const message = await db.$transaction(async (tx) => {
      const existing = await tx.message.findUnique({ where: { dedupHash } })
      if (existing) return { dup: existing }

      const created = await tx.message.create({
        data: {
          dedupHash,
          upstreamId: input.upstreamId,
          didId: did?.id,
          numberTo: to,
          numberFrom: from,
          text,
          segments,
          class: cls,
          channel: input.channel,
          simulated,
          carriedBy: 'PANEL',
          userId: user?.id,
          trueCost: simulated ? 0 : trueRate,
          userEarning,
          marginKept,
          billingStatus,
          receivedAt,
        },
      })

      if (user && userEarning > 0) {
        const fresh = await tx.user.update({
          where: { id: user.id },
          data: { walletBalance: { increment: userEarning } },
        })
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: 'EARNING',
            amount: userEarning,
            balanceAfter: fresh.walletBalance,
            messageId: created.id,
            note: did ? `${did.destination} · inbound ${cls}` : 'inbound',
          },
        })
        if (agent && commission > 0) {
          const agentFresh = await tx.user.update({
            where: { id: agent.id },
            data: { walletBalance: { increment: commission } },
          })
          await tx.transaction.create({
            data: {
              userId: agent.id,
              type: 'COMMISSION',
              amount: commission,
              balanceAfter: agentFresh.walletBalance,
              messageId: created.id,
              note: `commission · user ${user.email}`,
            },
          })
        }
      }

      if (did) {
        await tx.did.update({ where: { id: did.id }, data: { lastTrafficAt: receivedAt } })
      }
      return { created }
    })

    if ('dup' in message) return { status: 'duplicate', id: message.dup?.id ?? '' }

    // Post-commit, fire-and-forget: push to the user's channels
    if (user) void pushToUser(user.id, message.created.id)
    return {
      status: 'created',
      id: message.created.id,
      userId: user?.id ?? null,
      userEarning,
      trueCost: simulated ? 0 : trueRate,
    }
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2002') return { status: 'rejected', reason: 'duplicate race' }
    console.error('[ingest] error:', err.message)
    return { status: 'rejected', reason: err.message || 'db error' }
  }
}

/** Push one message to its owner's channels (webhook + live SMPP bind). */
export async function pushToUser(userId: string, messageId: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  const message = await db.message.findUnique({ where: { id: messageId }, include: { did: true } })
  if (!user || !message) return

  if (user.webhookUrl) {
    try {
      const res = await fetch(user.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(user.webhookSecret ? { 'x-webhook-secret': user.webhookSecret } : {}),
        },
        body: JSON.stringify({
          id: message.id,
          to: message.numberTo,
          from: message.numberFrom,
          text: message.text,
          segments: message.segments,
          class: message.class,
          destination: message.did?.destination,
          your_earning: message.userEarning,
          received_at: message.receivedAt,
          simulated: message.simulated,
        }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        await db.message.update({ where: { id: message.id }, data: { carriedBy: 'USER', carriedAt: new Date() } })
      }
      await db.rawEvent.create({
        data: {
          source: 'WEBHOOK_OUT',
          payload: JSON.stringify({ url: user.webhookUrl, status: res.status, messageId }),
          processed: res.ok,
          note: res.ok ? 'delivered' : 'remote error',
        },
      }).catch(() => {})
    } catch (e) {
      await db.rawEvent.create({
        data: {
          source: 'WEBHOOK_OUT',
          payload: JSON.stringify({ url: user.webhookUrl, messageId }),
          processed: false,
          note: (e as Error).message?.slice(0, 200) || 'fetch failed',
        },
      }).catch(() => {})
    }
  }

  // SMPP push to a live user bind
  try {
    const { deliverToUser } = await import('@/lib/smpp/gateway')
    await deliverToUser(userId, message)
  } catch {
    // gateway not started or user not bound — message stays visible in UI/API
  }
}
