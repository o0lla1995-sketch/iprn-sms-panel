'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

async function scopeUserIds(uid: string, role: string): Promise<string[] | null> {
  if (role === 'ADMIN') return null // null = all
  if (role === 'AGENT') {
    const kids = await db.user.findMany({ where: { parentId: uid }, select: { id: true } })
    return [...kids.map((k) => k.id), uid]
  }
  return [uid]
}

export async function deleteMessages(formData: FormData) {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Unauthenticated' }
  const ids = formData.getAll('ids').map(String).filter(Boolean)
  const single = String(formData.get('id') || '')
  if (single) ids.push(single)
  if (ids.length === 0) return { ok: false, error: 'Nothing selected' }

  const allowed = await scopeUserIds(session.uid, session.role)
  const now = new Date()
  let n = 0
  for (const id of ids) {
    const m = await db.message.findUnique({ where: { id } })
    if (!m || m.deletedAt) continue
    if (allowed && !m.userId) continue
    if (allowed && m.userId && !allowed.includes(m.userId)) continue
    await db.message.update({ where: { id }, data: { deletedAt: now } })
    n++
  }
  await db.auditLog.create({
    data: {
      actorId: session.uid,
      actorEmail: session.email,
      action: 'TRAFFIC_DELETE',
      entity: 'Message',
      detail: `soft-deleted ${n} message(s)`,
    },
  })
  revalidatePath('/panel/traffic')
  return { ok: true, count: n }
}
