import 'server-only'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/** Authenticate a panel user via x-api-key (their own key). */
export async function authApiKey(req: NextRequest) {
  const key = req.headers.get('x-api-key') || req.nextUrl.searchParams.get('api_key') || ''
  if (!key.startsWith('usr_')) return null
  const user = await db.user.findUnique({ where: { apiKey: key } })
  if (!user || user.status !== 'ACTIVE') return null
  return user
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}
