import 'server-only'
import * as smpp from 'smpp'
import * as net from 'node:net'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { ingestInbound, pushToUser } from '@/lib/ingest'
import type { Pdu, Session } from 'smpp'

/**
 * Gateway live state. Backed by globalThis because the instrumentation
 * bundle (which starts the gateway) and route bundles (which report status)
 * get separate module instances — the process-global object keeps ONE truth.
 */
interface GwState {
  started: boolean
  port: number
  upstreamSession: any | null
  userSessions: Map<string, Set<any>>
}
const g = globalThis as unknown as { __iprnGw?: GwState }
const S: GwState = (g.__iprnGw ??= { started: false, port: 0, upstreamSession: null, userSessions: new Map() })


/**
 * SMPP 3.4 gateway — mirrors the upstream platform's own connector model.
 *
 * Two classes of ESMEs bind into this server:
 *  1. The upstream platform (supplier-side connector): it submits traffic to us
 *     (submit_sm). We respond with a message id, ingest it (accounting), and —
 *     when auto_dlr is on — send the DLR receipt back within seconds so the
 *     upstream 24h DLR rule can never zero a message.
 *  2. Panel users: they bind as receiver/transceiver with the credentials issued
 *     in Settings → My Channel; we push their numbers' inbound traffic to them
 *     (deliver_sm). Their deliver_sm_resp marks the message carried by the user.
 */

const userSessions = S.userSessions // userId → live sessions

export async function startGateway(): Promise<void> {
  if (S.started) return
  if (process.env.ENABLE_SMPP === 'false') {
    console.log('[smpp] gateway disabled via ENABLE_SMPP=false')
    return
  }
  const s = await getSettings()
  S.port = Number(s.smpp_port || process.env.SMPP_PORT || 2775)
  const server = smpp.createServer({ debug: false }, (session: any) => attach(session))
  server.on('error', (e) => console.error('[smpp] server error:', (e as Error)?.message))
  server.listen(S.port, '0.0.0.0', () => {
    S.started = true
    console.log(`[smpp] gateway listening on 0.0.0.0:${S.port}`)
  })
  S.started = true
}

function attach(session: any) {
  session._gw = { isUpstream: false, userId: null, pending: new Map<number, string>() }

  const bindHandler = (pdu: Pdu) => {
    session.pause()
    void onBind(session, pdu).finally(() => session.resume())
  }
  session.on('bind_transceiver', bindHandler)
  session.on('bind_receiver', bindHandler)
  session.on('bind_transmitter', bindHandler)

  session.on('submit_sm', (pdu: Pdu) => void onSubmitSm(session, pdu))
  session.on('deliver_sm_resp', (pdu: Pdu) => onDeliverSmResp(session, pdu))
  session.on('enquire_link', (pdu?: Pdu) => session.send(pdu?.response()))
  session.on('unbind', (pdu?: Pdu) => {
    session.send(pdu?.response())
    cleanup(session)
  })
  session.on('close', () => cleanup(session))
  session.on('error', (err: Error) => console.error('[smpp] session error:', err?.message))
}

async function onBind(session: any, pdu: Pdu) {
  const sid = String(pdu.system_id || '')
  const pass = String(pdu.password || '')
  const s = await getSettings()

  // 1) upstream platform connector bind
  if (sid && sid === s.upstream_smpp_system_id && pass && pass === s.upstream_smpp_password) {
    session._gw.isUpstream = true
    S.upstreamSession = session
    console.log(`[smpp] UPSTREAM platform bound (system_id=${sid})`)
    session.send(pdu.response({ command_status: smpp.ESME_ROK }))
    db.rawEvent
      .create({ data: { source: 'SMPP', payload: JSON.stringify({ event: 'upstream_bind', system_id: sid }), processed: true } })
      .catch(() => {})
    return
  }

  // 2) panel user bind (credentials issued per-user in the panel)
  const user = await db.user.findUnique({ where: { smppSystemId: sid } })
  if (
    user &&
    user.status === 'ACTIVE' &&
    user.smppPassword &&
    pass === user.smppPassword
  ) {
    session._gw.userId = user.id
    if (!userSessions.has(user.id)) userSessions.set(user.id, new Set())
    userSessions.get(user.id)!.add(session)
    console.log(`[smpp] user bound (${user.email}, system_id=${sid})`)
    session.send(pdu.response({ command_status: smpp.ESME_ROK }))
    db.rawEvent
      .create({ data: { source: 'SMPP', payload: JSON.stringify({ event: 'user_bind', user: user.email, system_id: sid }), processed: true } })
      .catch(() => {})
    return
  }

  console.warn(`[smpp] rejected bind system_id=${sid}`)
  session.send(pdu.response({ command_status: smpp.ESME_RBINDFAIL }))
  setTimeout(() => session.close(), 50)
}

function decodeText(shortMessage: unknown, dataCoding: number | undefined): string {
  if (shortMessage === undefined || shortMessage === null) return ''
  // the smpp lib decodes short_message into { udh?, message }
  let msg: unknown
  if (typeof shortMessage === 'string') msg = shortMessage
  else if (Buffer.isBuffer(shortMessage)) msg = shortMessage
  else if (typeof shortMessage === 'object' && shortMessage !== null && 'message' in (shortMessage as object))
    msg = (shortMessage as { message?: unknown }).message
  else msg = shortMessage
  if (msg === undefined || msg === null) return ''
  if (typeof msg === 'string') return msg
  if (Buffer.isBuffer(msg)) {
    if (dataCoding === 8 || dataCoding === 4) {
      const be = Buffer.from(msg)
      if (be.length % 2 === 0) be.swap16()
      return be.toString('utf16le')
    }
    const utf8 = msg.toString('utf8')
    if (!utf8.includes('\uFFFD')) return utf8
    return msg.toString('latin1')
  }
  return String(msg)
}

function countSegments(text: string): number {
  if (!text) return 1
  return text.length > 160 ? Math.ceil(text.length / 153) : 1
}

async function onSubmitSm(session: any, pdu: Pdu) {
  // Only the upstream platform may submit traffic through the supplier connector
  if (!session._gw?.isUpstream) {
    // 11 = ESME_RINVBNDSTS (bind status invalid for this operation)
    session.send(pdu.response({ command_status: 11 }))
    return
  }

  const to = String(pdu.destination_addr || '')
  const from = String(pdu.source_addr || '')
  const text = decodeText(pdu.short_message, pdu.data_coding)
  const messageId = 'gw' + randomBytes(8).toString('hex')

  // Ack immediately with a message id; ingest async
  session.send(pdu.response({ command_status: smpp.ESME_ROK, message_id: messageId }))

  const res = await ingestInbound({
    channel: 'SMPP',
    to,
    from,
    text,
    segments: countSegments(text),
    upstreamId: messageId,
  })
  console.log(`[smpp] submit_sm → ${to} from ${from} :: ${res.status}`)

  // auto DLR receipt (registered_delivery bit 1 = SMSC delivery receipt requested)
  const wantsDlr = (pdu.registered_delivery ?? 0) & 1
  const s = await getSettings()
  if (s.auto_dlr === 'true' && wantsDlr && res.status === 'created') {
    sendDlr(session, { to, from, text }, messageId)
  }
}

function sendDlr(session: any, orig: { to: string; from: string; text: string }, messageId: string) {
  const now = new Date()
  const stamp = (d: Date) =>
    d.toISOString().slice(2, 4) +
    d.toISOString().slice(5, 7) +
    d.toISOString().slice(8, 10) +
    d.toISOString().slice(11, 16).replace(':', '')
  const receipt =
    `id:${messageId} sub:001 dlvrd:001 submitdate:${stamp(now)} donedate:${stamp(now)} ` +
    `stat:DELIVRD err:000 text:${orig.text.slice(0, 20).replace(/[\r\n]+/g, ' ')}`
  try {
    session.deliver_sm(
      {
        source_addr: orig.to,
        dest_addr_ton: 1,
        dest_addr_npi: 1,
        destination_addr: orig.from,
        esm_class: 0x04,
        data_coding: 0,
        short_message: receipt,
      },
      (resp?: Pdu) => {
        console.log(`[smpp] DLR receipt sent for ${messageId} (${resp?.command_status ?? 0})`)
      }
    )
  } catch (e) {
    console.error('[smpp] failed to send DLR:', (e as Error).message)
  }
}

function onDeliverSmResp(session: any, pdu?: Pdu) {
  if (!pdu) return
  const messageId = session._gw?.pending?.get(pdu.sequence_number)
  if (messageId && pdu.command_status === smpp.ESME_ROK) {
    session._gw.pending.delete(pdu.sequence_number)
    db.message
      .update({ where: { id: messageId }, data: { carriedBy: 'USER', carriedAt: new Date() } })
      .then(() => console.log(`[smpp] user carried ${messageId}`))
      .catch(() => {})
  }
}

function encodeDeliver(text: string): { short_message: string; data_coding: number } {
  // UCS2 carries every character safely; the smpp lib encodes the string for us
  return { short_message: text, data_coding: 8 }
}

/** Push one ingested message to the owner's live SMPP bind (if connected). */
export async function deliverToUser(
  userId: string,
  message: { id: string; numberTo: string; numberFrom: string; text: string; simulated: boolean }
) {
  const sessions = userSessions.get(userId)
  if (!sessions || sessions.size === 0) return false
  const session: any = sessions.values().next().value
  if (!session || session.paused) return false

  const enc = encodeDeliver(message.text)
  return new Promise<boolean>((resolve) => {
    try {
      session.deliver_sm(
        {
          source_addr: message.numberFrom,
          dest_addr_ton: 1,
          dest_addr_npi: 1,
          destination_addr: message.numberTo,
          registered_delivery: 0,
          ...enc,
        },
        (resp?: Pdu) => {
          if (resp && resp.command_status === smpp.ESME_ROK) {
            db.message
              .update({ where: { id: message.id }, data: { carriedBy: 'USER', carriedAt: new Date() } })
              .catch(() => {})
          }
          resolve(true)
        }
      )
      // correlate deliver_sm_resp → message for carriedBy tracking
      const seq = session.sequence ?? 0
      if (seq) session._gw?.pending?.set(seq, message.id)
    } catch {
      resolve(false)
    }
  })
}

function cleanup(session: any) {
  if (session._gw?.isUpstream && S.upstreamSession === session) S.upstreamSession = null
  if (session._gw?.userId) {
    const set = userSessions.get(session._gw.userId)
    if (set) {
      set.delete(session)
      if (set.size === 0) userSessions.delete(session._gw.userId)
    }
  }
}

export function gatewayStatus() {
  let onlineUsers = 0
  for (const set of S.userSessions.values()) onlineUsers += set.size
  return {
    started: S.started,
    port: S.port,
    upstreamConnected: !!S.upstreamSession,
    userBindCount: onlineUsers,
  }
}

/**
 * True when the SMPP port accepts connections. Belt & braces for dev, where
 * the instrumentation bundle that started the listener is a different module
 * instance from the route bundles reporting status: the TCP probe verifies
 * the listener is really up regardless of which instance holds the state.
 */
export async function gatewayListening(): Promise<boolean> {
  if (process.env.ENABLE_SMPP === 'false') return false
  if (S.started) return true
  if (!S.port) {
    const s = await getSettings()
    S.port = Number(s.smpp_port || process.env.SMPP_PORT || 2775)
  }
  const port = S.port
  if (!port) return false
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (v: boolean) => {
      if (settled) return
      settled = true
      try {
        sock.destroy()
      } catch {
        /* already closed */
      }
      resolve(v)
    }
    const sock = net.connect({ port, host: '127.0.0.1' })
    sock.setTimeout(600, () => done(false))
    sock.on('connect', () => done(true))
    sock.on('error', () => done(false))
  })
}
