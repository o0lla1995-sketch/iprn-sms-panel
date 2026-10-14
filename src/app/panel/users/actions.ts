'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getSession, hashPassword, genApiKey, genPassword, genSecret } from '@/lib/auth'
import { getSettings } from '@/lib/settings'

async function session() {
  return getSession()
}

async function audit(action: string, entity: string, entityId: string, detail: string) {
  const s = await session()
  await db.auditLog.create({
    data: { actorId: s?.uid ?? null, actorEmail: s?.email ?? 'system', action, entity, entityId, detail: detail.slice(0, 400) },
  })
}

export async function createUser(_prev: unknown, formData: FormData) {
  const s = await session()
  if (!s || (s.role !== 'ADMIN' && s.role !== 'AGENT')) return { ok: false, error: 'Not allowed' }
  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const roleInput = String(formData.get('role') || 'USER').toUpperCase()
  let role: 'USER' | 'AGENT' = roleInput === 'AGENT' ? 'AGENT' : 'USER'
  if (s.role === 'AGENT') role = 'USER' // agents can only create users
  if (s.role === 'ADMIN' && role === 'AGENT') {
    // ok
  }
  const password = String(formData.get('password') || '') || genPassword()
  const schedule = String(formData.get('schedule') || 'MONTHLY').toUpperCase() === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY'
  const settings = await getSettings()
  let marginPercent = Number(settings.default_margin || 30)
  let commission = 10
  if (s.role === 'ADMIN') {
    const m = Number(formData.get('marginPercent') || 0)
    if (m >= 0 && m <= 90) marginPercent = m
    const c = Number(formData.get('agentCommissionPercent') || 0)
    if (c >= 0 && c <= 100) commission = c
  }

  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'Name and valid email required' }
  const exists = await db.user.findUnique({ where: { email } })
  if (exists) return { ok: false, error: 'Email already exists' }

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      parentId: s.role === 'AGENT' ? s.uid : null,
      marginPercent,
      agentCommissionPercent: commission,
      payoutSchedule: schedule,
      apiKey: genApiKey(),
    },
  })
  await audit('USER_CREATE', 'User', user.id, `${email} as ${role} by ${s.email}`)
  revalidatePath('/panel/users')
  return { ok: true, message: `Created ${email}`, secret: password, secretLabel: 'Initial password — copy now, shown once' }
}

export async function updateUser(_prev: unknown, formData: FormData) {
  const s = await session()
  if (!s || s.role !== 'ADMIN') return { ok: false, error: 'Admin only' }
  const id = String(formData.get('id') || '')
  const user = await db.user.findUnique({ where: { id } })
  if (!user || user.role === 'ADMIN') return { ok: false, error: 'Invalid target' }

  const name = String(formData.get('name') || user.name).trim()
  const status = String(formData.get('status') || user.status) === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'
  const role = (String(formData.get('role') || user.role).toUpperCase() === 'AGENT' ? 'AGENT' : 'USER') as 'USER' | 'AGENT'
  const schedule = String(formData.get('schedule') || user.payoutSchedule).toUpperCase() === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY'
  const marginPercent = Math.min(90, Math.max(0, Number(formData.get('marginPercent') ?? user.marginPercent)))
  const agentCommissionPercent = Math.min(100, Math.max(0, Number(formData.get('agentCommissionPercent') ?? user.agentCommissionPercent)))

  await db.user.update({
    where: { id },
    data: { name, status, role, payoutSchedule: schedule, marginPercent, agentCommissionPercent },
  })
  await audit('USER_UPDATE', 'User', id, `${user.email} margin ${user.marginPercent}→${marginPercent}, role ${user.role}→${role}, status ${status}`)
  revalidatePath('/panel/users')
  return { ok: true, message: 'Saved' }
}

export async function toggleStatus(_prev: unknown, formData: FormData) {
  const s = await session()
  if (!s || s.role !== 'ADMIN') return { ok: false, error: 'Admin only' }
  const id = String(formData.get('id') || '')
  const user = await db.user.findUnique({ where: { id } })
  if (!user || user.role === 'ADMIN') return { ok: false, error: 'Invalid target' }
  const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
  await db.user.update({ where: { id }, data: { status: next } })
  await audit('USER_STATUS', 'User', id, `${user.email} → ${next}`)
  revalidatePath('/panel/users')
  return { ok: true, message: `${user.email} is now ${next}` }
}

async function ownedOrAdmin(targetId: string) {
  const s = await session()
  if (!s) return null
  if (s.role === 'ADMIN') return s
  if (s.role === 'AGENT') {
    const target = await db.user.findUnique({ where: { id: targetId } })
    if (target && target.parentId === s.uid) return s
  }
  return null
}

export async function resetPassword(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') || '')
  const s = await ownedOrAdmin(id)
  if (!s) return { ok: false, error: 'Not allowed' }
  const user = await db.user.findUnique({ where: { id } })
  if (!user || user.role === 'ADMIN') return { ok: false, error: 'Invalid target' }
  const pw = genPassword()
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw) } })
  await audit('USER_PASSWORD_RESET', 'User', id, `${user.email} by ${s.email}`)
  return { ok: true, message: `New password for ${user.email}`, secret: pw, secretLabel: 'New password — copy now, shown once' }
}

export async function resetApiKey(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') || '')
  const s = await ownedOrAdmin(id)
  if (!s) return { ok: false, error: 'Not allowed' }
  const user = await db.user.findUnique({ where: { id } })
  if (!user || user.role === 'ADMIN') return { ok: false, error: 'Invalid target' }
  const key = genApiKey()
  await db.user.update({ where: { id }, data: { apiKey: key } })
  await audit('USER_APIKEY_RESET', 'User', id, `${user.email} by ${s.email}`)
  return { ok: true, message: `New API key for ${user.email}`, secret: key, secretLabel: 'New x-api-key — copy now, shown once' }
}

export async function issueSmpp(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') || '')
  const s = await ownedOrAdmin(id)
  if (!s) return { ok: false, error: 'Not allowed' }
  const user = await db.user.findUnique({ where: { id } })
  if (!user || user.role === 'ADMIN') return { ok: false, error: 'Invalid target' }
  const base = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase() || 'bind'
  const systemId = `${base}${Math.floor(100 + Math.random() * 900)}`
  const pass = genSecret(8)
  await db.user.update({ where: { id }, data: { smppSystemId: systemId, smppPassword: pass } })
  await audit('USER_SMPP_ISSUE', 'User', id, `${user.email} bind ${systemId} by ${s.email}`)
  return {
    ok: true,
    message: `SMPP bind credentials for ${user.email}`,
    secret: `system_id: ${systemId}\npassword: ${pass}\nbind as: receiver or transceiver`,
    secretLabel: 'Give these to the user — shown once',
  }
}

export async function adjustWallet(_prev: unknown, formData: FormData) {
  const s = await session()
  if (!s || s.role !== 'ADMIN') return { ok: false, error: 'Admin only' }
  const id = String(formData.get('id') || '')
  const amount = Number(formData.get('amount') || 0)
  const note = String(formData.get('note') || 'manual adjustment').slice(0, 200)
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: 'Invalid amount' }
  const user = await db.user.findUnique({ where: { id } })
  if (!user || user.role === 'ADMIN') return { ok: false, error: 'Invalid target' }
  const next = +(user.walletBalance + amount).toFixed(4)
  if (next < 0) return { ok: false, error: 'Balance would go negative' }
  await db.$transaction(async (tx) => {
    const fresh = await tx.user.update({ where: { id }, data: { walletBalance: { increment: amount } } })
    await tx.transaction.create({
      data: {
        userId: id,
        type: 'ADJUSTMENT',
        amount,
        balanceAfter: fresh.walletBalance,
        note,
      },
    })
  })
  await audit('WALLET_ADJUST', 'User', id, `${user.email} ${amount >= 0 ? '+' : ''}${amount} — ${note}`)
  revalidatePath('/panel/users')
  return { ok: true, message: `${user.email} balance ${amount >= 0 ? '+' : ''}${amount.toFixed(2)}` }
}
