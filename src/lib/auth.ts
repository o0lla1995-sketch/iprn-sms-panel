import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

export const SESSION_COOKIE = 'iprn_session'
export type Role = 'ADMIN' | 'AGENT' | 'USER'

export interface SessionPayload {
  uid: string
  email: string
  role: Role
  name: string
}

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10)
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash)
}

function secret() {
  const s = process.env.SESSION_SECRET || 'insecure-dev-secret'
  return new TextEncoder().encode(s)
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // only flag Secure when the panel is actually served over https
    secure: (process.env.PUBLIC_URL || '').startsWith('https'),
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

/** For server components: redirects to /login when unauthenticated. */
export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession()
  if (!s) redirect('/login')
  return s
}

/** For server components: redirects to dashboard when role not allowed. */
export async function requireRole(roles: Role[]): Promise<SessionPayload> {
  const s = await requireSession()
  if (!roles.includes(s.role)) redirect('/panel/dashboard')
  return s
}

export function genApiKey() {
  return 'usr_' + randomBytes(16).toString('hex')
}

export function genSecret(len = 12) {
  return randomBytes(len).toString('hex')
}

export function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  let out = ''
  const buf = randomBytes(14)
  for (let i = 0; i < 14; i++) out += chars[buf[i] % chars.length]
  return out
}
