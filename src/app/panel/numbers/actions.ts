'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getSettings, getBool } from '@/lib/settings'
import { normalizeMsisdn } from '@/lib/ingest'

async function audit(action: string, entity: string, entityId: string, detail: string) {
  const s = await getSession()
  await db.auditLog.create({
    data: { actorId: s?.uid ?? null, actorEmail: s?.email ?? 'system', action, entity, entityId, detail: detail.slice(0, 500) },
  })
}

/** USER self-service: rent an available number (if enabled). */
export async function rentNumber(formData: FormData) {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { ok: false, error: 'Users only' }
  if (!(await getBool('self_service_numbers', true))) return { ok: false, error: 'Self-service is disabled — contact support' }

  const id = String(formData.get('id') || '')
  const did = await db.did.findUnique({ where: { id } })
  if (!did || did.status !== 'AVAILABLE') return { ok: false, error: 'Number is no longer available' }

  await db.did.update({
    where: { id },
    data: { status: 'ASSIGNED', assignedUserId: session.uid, assignedAt: new Date(), note: 'self-service rent' },
  })
  await audit('NUMBER_RENT', 'Did', id, `user ${session.email} rented +${did.number} (${did.destination})`)
  revalidatePath('/panel/numbers')
  revalidatePath('/panel/dashboard')
  return { ok: true }
}

/** ADMIN: assign a number to any active user. */
export async function assignNumber(formData: FormData) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, error: 'Admin only' }
  const id = String(formData.get('id') || '')
  const userId = String(formData.get('userId') || '')
  const did = await db.did.findUnique({ where: { id } })
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!did || !user || user.role === 'ADMIN') return { ok: false, error: 'Invalid number or user' }
  await db.did.update({
    where: { id },
    data: { status: 'ASSIGNED', assignedUserId: userId, assignedAt: new Date(), note: 'assigned by admin' },
  })
  await audit('NUMBER_ASSIGN', 'Did', id, `admin assigned +${did.number} to ${user.email}`)
  revalidatePath('/panel/numbers')
  return { ok: true }
}

/** ADMIN/USER(owner): release a number back to the pool. */
export async function releaseNumber(formData: FormData) {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Unauthenticated' }
  const id = String(formData.get('id') || '')
  const did = await db.did.findUnique({ where: { id } })
  if (!did) return { ok: false, error: 'Not found' }
  if (session.role !== 'ADMIN' && did.assignedUserId !== session.uid) return { ok: false, error: 'Not yours' }

  await db.did.update({
    where: { id },
    data: { status: 'AVAILABLE', assignedUserId: null, assignedAt: null, note: `released by ${session.email}` },
  })
  await audit('NUMBER_RELEASE', 'Did', id, `${session.email} released +${did.number}`)
  revalidatePath('/panel/numbers')
  return { ok: true }
}

/** ADMIN: bulk add numbers. Lines: number,destination,rate[,class] — or pasted CSV rows are auto-mapped. */
export async function addNumbers(formData: FormData) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, error: 'Admin only' }
  const raw = String(formData.get('numbers') || '')
  const defaultDest = String(formData.get('destination') || '').trim() || 'Unassigned'
  const fallbackRate = Number(formData.get('rate') || 0) || 0

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let added = 0
  const errors: string[] = []

  for (const line of lines) {
    // strip quotes from CSV pastes
    const cells = line.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, '').trim())
    const number = normalizeMsisdn(cells.find((c) => /^\+?\d[\d\s]{6,20}$/.test(c)) || cells.find((c) => /^\d{7,20}$/.test(c)) || '')
    const rateCell = cells.find((c) => /^\d+(\.\d+)?$/.test(c) && Number(c) > 0 && Number(c) < 10)
    const rate = rateCell !== undefined ? Number(rateCell) : fallbackRate
    const classCell = (cells.find((c) => /^(P2P|A2P|BOTH)$/i.test(c)) || 'BOTH')
    const destCell =
      cells.find((c) => c.length > 2 && /[a-zA-Z]/.test(c) && !/^(PRN|WHOLESALE|TWO_WAY|ONE_WAY|SW|WSALE)$/i.test(c)) ||
      defaultDest

    if (!number || number.length < 7) {
      errors.push(`skip: ${line.slice(0, 40)}`)
      continue
    }
    const exists = await db.did.findUnique({ where: { number } })
    if (exists) {
      errors.push(`exists: +${number}`)
      continue
    }
    await db.did.create({
      data: {
        number,
        destination: destCell,
        class: classCell.toUpperCase(),
        model: 'PRN',
        trueRate: rate,
        status: 'AVAILABLE',
        source: 'IMPORT',
      },
    })
    added++
  }
  await audit('NUMBERS_ADD', 'Did', 'bulk', `added ${added}, skipped ${errors.length}`)
  revalidatePath('/panel/numbers')
  return { ok: true, added, errors: errors.slice(0, 8) }
}

// ─── Bulk import (auto-priced from Rate Groups) ───────────────────────────────

export interface ImportNumbersResult {
  ok: boolean
  added: number
  existed: number
  priced: number
  unpriced: string[]
  errors: string[]
}

interface ParsedLine {
  number: string
  destination: string
  cls: string
  capability: string
  model: string
  rateOverride: number | null
}

/** One import line: JSON object or CSV/TSV/semicolon row. */
function parseImportLine(line: string): ParsedLine | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // JSON line: {"number":"213562242832","destination":"Algeria Azure","class":"BOTH",...}
  if (trimmed.startsWith('{')) {
    try {
      const o = JSON.parse(trimmed) as Record<string, unknown>
      const number = normalizeMsisdn(String(o.number ?? o.msisdn ?? o.did ?? ''))
      const cls = /^(P2P|A2P|BOTH)$/i.test(String(o.class ?? '')) ? String(o.class).toUpperCase() : 'BOTH'
      const capability = /^(TWO_WAY|ONE_WAY)$/i.test(String(o.capability ?? '')) ? String(o.capability).toUpperCase() : 'TWO_WAY'
      const model = /^(PRN|WHOLESALE)$/i.test(String(o.model ?? '')) ? String(o.model).toUpperCase() : 'PRN'
      const rawRate = Number(o.trueRate ?? o.true_rate ?? o.rate ?? NaN)
      const rateOverride = Number.isFinite(rawRate) && rawRate >= 0 && rawRate < 10 ? rawRate : null
      if (!number) return null
      return {
        number,
        destination: String(o.destination ?? o.dest ?? '').trim(),
        cls,
        capability,
        model,
        rateOverride,
      }
    } catch {
      return null
    }
  }

  // CSV / TSV / semicolon row (columns auto-mapped)
  const cells = trimmed.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, '').trim())
  const number = normalizeMsisdn(
    cells.find((c) => /^\+?\d[\d\s]{6,20}$/.test(c)) || cells.find((c) => /^\d{7,20}$/.test(c)) || ''
  )
  const classCell = cells.find((c) => /^(P2P|A2P|BOTH)$/i.test(c))
  const modelCell = cells.find((c) => /^(PRN|WHOLESALE)$/i.test(c))
  const capCell = cells.find((c) => /^(TWO_WAY|ONE_WAY)$/i.test(c))
  const rateCell = cells.find((c) => /^\d+(\.\d+)?$/.test(c) && Number(c) > 0 && Number(c) < 10)
  const destCell = cells.find(
    (c) => c.length > 2 && /[a-zA-Z]/.test(c) && !/^(PRN|WHOLESALE|TWO_WAY|ONE_WAY|SW|WSALE|P2P|A2P|BOTH)$/i.test(c)
  )
  if (!number) return null
  return {
    number,
    destination: destCell ?? '',
    cls: (classCell || 'BOTH').toUpperCase(),
    capability: (capCell || 'TWO_WAY').toUpperCase(),
    model: (modelCell || 'PRN').toUpperCase(),
    rateOverride: rateCell !== undefined ? Number(rateCell) : null,
  }
}

/** Auto-pricing: exact destination match first, then partial match — highest rate wins. */
function priceFromGroups(dest: string, groups: { destination: string; trueRate: number }[]): number | null {
  if (!dest) return null
  const lower = dest.toLowerCase()
  const exact = groups.filter((g) => g.destination.toLowerCase() === lower)
  if (exact.length) return Math.max(...exact.map((g) => g.trueRate))
  const partial = groups.filter(
    (g) => g.destination.toLowerCase().includes(lower) || lower.includes(g.destination.toLowerCase())
  )
  if (partial.length) return Math.max(...partial.map((g) => g.trueRate))
  return null
}

/**
 * ADMIN: bulk import numbers from pasted CSV/JSON lines.
 * - fields: number, destination, class, capability, model (+ optional rate override column)
 * - auto-priced from Rate Groups (highest matching rate); explicit rate column overrides
 * - idempotent: existing numbers are skipped · source=IMPORT
 */
export async function importNumbers(
  _prev: ImportNumbersResult | null,
  formData: FormData
): Promise<ImportNumbersResult> {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return { ok: false, added: 0, existed: 0, priced: 0, unpriced: [], errors: ['Admin only'] }
  }

  const raw = String(formData.get('list') || '')
  const fallbackDest = String(formData.get('destination') || '').trim() || 'Unassigned'
  const fallbackRate = Math.max(0, Number(formData.get('rate') || 0) || 0)

  const groups = await db.rateGroup.findMany({ select: { destination: true, trueRate: true } })
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const res: ImportNumbersResult = { ok: true, added: 0, existed: 0, priced: 0, unpriced: [], errors: [] }

  for (const line of lines) {
    const parsed = parseImportLine(line)
    if (!parsed || parsed.number.length < 7) {
      res.errors.push(`skip: ${line.slice(0, 40)}`)
      continue
    }
    const exists = await db.did.findUnique({ where: { number: parsed.number } })
    if (exists) {
      res.existed++
      continue
    }
    const destination = parsed.destination || fallbackDest
    const auto = priceFromGroups(destination, groups)
    const rate = parsed.rateOverride !== null ? parsed.rateOverride : (auto ?? fallbackRate)
    await db.did.create({
      data: {
        number: parsed.number,
        destination,
        class: parsed.cls,
        capability: parsed.capability,
        model: parsed.model,
        trueRate: rate,
        status: 'AVAILABLE',
        source: 'IMPORT',
      },
    })
    res.added++
    if (rate > 0) res.priced++
    else res.unpriced.push(`+${parsed.number} (${destination})`)
  }

  await audit(
    'NUMBERS_IMPORT',
    'Did',
    'bulk',
    `imported ${res.added} (auto-priced ${res.priced}), existed ${res.existed}, unpriced ${res.unpriced.length}, skipped ${res.errors.length}`
  )
  revalidatePath('/panel/numbers')
  return res
}

/** ADMIN: update a number (rate, destination, class, note). */
export async function updateNumber(formData: FormData) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, error: 'Admin only' }
  const id = String(formData.get('id') || '')
  const trueRate = Math.max(0, Number(formData.get('trueRate') || 0))
  const destination = String(formData.get('destination') || '').trim()
  const cls = String(formData.get('class') || 'BOTH')
  const note = String(formData.get('note') || '').trim()
  const did = await db.did.findUnique({ where: { id } })
  if (!did) return { ok: false, error: 'Not found' }
  await db.did.update({
    where: { id },
    data: {
      trueRate,
      destination: destination || did.destination,
      class: cls,
      note: note || null,
    },
  })
  await audit('NUMBER_UPDATE', 'Did', id, `+${did.number} rate ${did.trueRate}→${trueRate}`)
  revalidatePath('/panel/numbers')
  return { ok: true }
}
