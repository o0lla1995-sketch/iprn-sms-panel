import 'server-only'
import { cache } from 'react'
import { db } from '@/lib/db'

export const getSettings = cache(async (): Promise<Record<string, string>> => {
  const rows = await db.setting.findMany()
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
})

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const s = await getSettings()
  return s[key] ?? fallback
}

export async function setSettings(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
}

export async function getNumber(key: string, fallback: number): Promise<number> {
  const v = await getSetting(key, String(fallback))
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await getSetting(key, fallback ? 'true' : 'false')
  return v === 'true' || v === '1'
}
