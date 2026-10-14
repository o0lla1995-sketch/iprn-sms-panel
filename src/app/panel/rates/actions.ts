'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

async function adminOnly() {
  const s = await getSession()
  if (!s || s.role !== 'ADMIN') throw new Error('Admin only')
  return s
}

export async function saveRateGroup(formData: FormData) {
  const session = await adminOnly()
  const id = String(formData.get('id') || '')
  const destination = String(formData.get('destination') || '').trim()
  const trueRate = Math.max(0, Number(formData.get('trueRate') || 0))
  const cls = String(formData.get('class') || 'BOTH')
  const model = String(formData.get('model') || 'PRN')
  const numbersCount = Math.max(0, Number(formData.get('numbersCount') || 0) || 0)
  if (!destination || !Number.isFinite(trueRate)) return { ok: false, error: 'Invalid input' }

  if (id) {
    await db.rateGroup.update({ where: { id }, data: { destination, trueRate, class: cls, model, numbersCount } })
  } else {
    await db.rateGroup.create({ data: { destination, trueRate, class: cls, model, numbersCount } })
  }
  await db.auditLog.create({
    data: {
      actorId: session.uid, actorEmail: session.email, action: 'RATE_SAVE',
      entity: 'RateGroup', entityId: id || destination,
      detail: `${destination} true=${trueRate} class=${cls}`,
    },
  })
  revalidatePath('/panel/rates')
  return { ok: true }
}

export async function deleteRateGroup(formData: FormData) {
  const session = await adminOnly()
  const id = String(formData.get('id') || '')
  const g = await db.rateGroup.findUnique({ where: { id } })
  if (!g) return { ok: false, error: 'Not found' }
  await db.rateGroup.delete({ where: { id } })
  await db.auditLog.create({
    data: { actorId: session.uid, actorEmail: session.email, action: 'RATE_DELETE', entity: 'RateGroup', entityId: id, detail: g.destination },
  })
  revalidatePath('/panel/rates')
  return { ok: true }
}

/** Bulk import: lines of "destination,rate[,class][,count]" — e.g. pasted from the upstream Settlement Rates page. */
export async function importRateGroups(formData: FormData) {
  const session = await adminOnly()
  const raw = String(formData.get('list') || '')
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let upserts = 0
  const errors: string[] = []
  for (const line of lines) {
    const cells = line.split(/[,;\t]/).map((c) => c.replace(/"/g, '').trim())
    const dest = cells.find((c) => c.length > 1 && /[a-zA-Z]/.test(c) && !/^(PRN|WHOLESALE|BOTH|P2P|A2P)$/i.test(c))
    const rateCell = cells.find((c) => /^\d+(\.\d+)?$/.test(c) && Number(c) > 0 && Number(c) < 10)
    const classCell = cells.find((c) => /^(P2P|A2P|BOTH)$/i.test(c))
    const countCell = cells.find((c) => /^\d{1,7}$/.test(c))
    if (!dest || rateCell === undefined) {
      errors.push(line.slice(0, 40))
      continue
    }
    const trueRate = Number(rateCell)
    const cls = (classCell || 'BOTH').toUpperCase()
    const numbersCount = countCell ? Number(countCell) : 0
    const existing = await db.rateGroup.findFirst({ where: { destination: dest, trueRate } })
    if (existing) {
      await db.rateGroup.update({ where: { id: existing.id }, data: { class: cls, numbersCount } })
    } else {
      await db.rateGroup.create({ data: { destination: dest, trueRate, class: cls, numbersCount } })
    }
    upserts++
  }
  await db.auditLog.create({
    data: { actorId: session.uid, actorEmail: session.email, action: 'RATES_IMPORT', entity: 'RateGroup', detail: `${upserts} rows, ${errors.length} skipped` },
  })
  revalidatePath('/panel/rates')
  return { ok: true, upserts, errors: errors.slice(0, 6) }
}
