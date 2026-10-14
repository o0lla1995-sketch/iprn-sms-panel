import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie, verifyPassword, type Role } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return Response.json({ ok: false, error: 'Email and password are required' }, { status: 400 })
    }
    const user = await db.user.findUnique({ where: { email: String(email).toLowerCase() } })
    if (!user || !(await verifyPassword(String(password), user.passwordHash))) {
      return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 })
    }
    if (user.status !== 'ACTIVE') {
      return Response.json({ ok: false, error: 'Account suspended' }, { status: 403 })
    }
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await setSessionCookie({ uid: user.id, email: user.email, role: user.role as Role, name: user.name })
    return Response.json({ ok: true, role: user.role })
  } catch {
    return Response.json({ ok: false, error: 'Bad request' }, { status: 400 })
  }
}
