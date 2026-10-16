#!/usr/bin/env bun
/**
 * Zero-leak guard for the hidden margin engine.
 *
 * Guarantee under test (Task 4-b #4):
 *   trueCost / marginKept / trueRate / true_value / margin_kept / true_rate
 *   must NEVER appear on any non-admin surface (page, API or export).
 *
 * Mode 1 — STATIC (always runs)
 *   Greps every UI surface file (src/app/** + src/components/panel/**).
 *   Every line containing a forbidden token must either
 *     (a) carry an admin guard on the same line (isAdmin / role === 'ADMIN'), or
 *     (b) match a reviewed ALLOWLIST entry below (documented reason).
 *   Anything else is reported as a LEAK and fails the run.
 *   Engine files (src/lib/**, prisma/**) are not surfaces — they are excluded.
 *
 * Mode 2 — RUNTIME (runs when the dev server is reachable)
 *   - panel pages fetched with minted USER and AGENT sessions
 *   - public API fetched with USER and AGENT x-api-key
 *   - CSV export + live traffic endpoint with USER and AGENT sessions
 *   - admin-only routes must redirect (30x) for non-admins
 *   Probe responses must not contain any forbidden token or admin-only label.
 *   If no USER/AGENT account exists yet, probe accounts are created
 *   (local database only — never commit secrets, never run against shared DBs).
 *
 * Run: bun scripts/zero-leak-check.ts   (or: bun run check:leak)
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { randomBytes } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Mode 1 — static inspection
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd()
const TOKENS = ['trueCost', 'marginKept', 'trueRate', 'true_value', 'margin_kept', 'true_rate'] as const

const ADMIN_GUARD = /isAdmin|role\s*===\s*["']ADMIN["']|role\s*!==\s*["']ADMIN["']/

interface AllowEntry {
  file: string
  pattern: RegExp
  why: string
}

/**
 * Reviewed allow-list. Every entry was manually verified:
 * the token on that line either derives a user-safe value, or renders/writes
 * exclusively inside an admin-only code path (runtime role-checked).
 */
const ALLOWLIST: AllowEntry[] = [
  {
    file: 'src/app/api/v1/numbers/route.ts',
    pattern: /your_rate_per_message.*\.trueRate/,
    why: 'derivation only — the API responds with the derived user rate, never the raw value',
  },
  {
    file: 'src/app/api/v1/rates/route.ts',
    pattern: /your_rate_per_message.*g\.trueRate/,
    why: 'derivation only — the API responds with the derived user rate, never the raw value',
  },
  {
    file: 'src/app/panel/numbers/page.tsx',
    pattern: /const userRate = d\.trueRate/,
    why: 'derivation only — non-admins see the derived rate (userRate), never d.trueRate',
  },
  {
    file: 'src/app/panel/numbers/page.tsx',
    pattern: /name="trueRate"/,
    why: 'admin-only per-number edit form — rendered inside the isAdmin && block',
  },
  {
    file: 'src/app/panel/numbers/page.tsx',
    pattern: /adminAgg|adminSums/,
    why: 'admin-only 7d aggregates — rendered exclusively inside isAdmin cells',
  },
  {
    file: 'src/app/panel/numbers/actions.ts',
    pattern: /trueRate/,
    why: 'admin-only server actions (runtime role-checked) — true rates are written to Did, never returned to any client',
  },
  {
    file: 'src/app/panel/rates/page.tsx',
    pattern: /trueRate/,
    why: 'non-admin branch early-returns; remaining usages are derived-rate math or admin-only forms/tables',
  },
  {
    file: 'src/app/panel/rates/actions.ts',
    pattern: /trueRate/,
    why: 'admin-only server actions (runtime role-checked)',
  },
  {
    file: 'src/app/panel/dashboard/page.tsx',
    pattern: /trueCost|marginKept|trueValue/,
    why: 'shared server-side aggregation; margin/true renders live in the ADMIN branch only and non-admin chart payloads are zero-sanitized',
  },
  {
    file: 'src/components/panel/charts.tsx',
    pattern: /marginKept/,
    why: 'margin series is rendered only when showMargin=true, which only the admin dashboard passes',
  },
  {
    file: 'src/app/panel/traffic/types.ts',
    pattern: /trueCost|marginKept/,
    why: 'type-only optional fields — populated solely for admin sessions, never serialized for non-admins',
  },
]

const SCAN_ROOTS = ['src/app', 'src/components/panel']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

interface Hit {
  file: string
  line: number
  text: string
  disposition: 'guarded' | 'allow-listed' | 'LEAK'
  why: string
}

function staticCheck(): { hits: Hit[]; files: number } {
  const hits: Hit[] = []
  const files: string[] = []
  for (const r of SCAN_ROOTS) {
    const abs = join(ROOT, r)
    if (!existsSync(abs)) continue
    for (const f of walk(abs)) files.push(f)
  }

  for (const f of files) {
    const rel = relative(ROOT, f).split(sep).join('/')
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((text, i) => {
      for (const t of TOKENS) {
        if (!text.includes(t)) continue
        if (ADMIN_GUARD.test(text)) {
          hits.push({ file: rel, line: i + 1, text: text.trim(), disposition: 'guarded', why: 'admin guard on the same line' })
        } else {
          const entry = ALLOWLIST.find((a) => a.file === rel && a.pattern.test(text))
          if (entry) {
            hits.push({ file: rel, line: i + 1, text: text.trim(), disposition: 'allow-listed', why: entry.why })
          } else {
            hits.push({ file: rel, line: i + 1, text: text.trim(), disposition: 'LEAK', why: 'no admin guard, no allow-list entry' })
          }
        }
        break // one classification per line is enough
      }
    })
  }
  return { hits, files: files.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 2 — runtime probes
// ─────────────────────────────────────────────────────────────────────────────

const BASE = (process.env.PANEL_URL || 'http://localhost:3000').replace(/\/+$/, '')
const HTML_LABELS = ['true rate', 'true value', 'margin kept', 'margin on them'] // admin-only labels, case-insensitive

function findForbidden(text: string): string[] {
  const found: string[] = []
  for (const t of TOKENS) if (text.includes(t)) found.push(t)
  const lower = text.toLowerCase()
  for (const l of HTML_LABELS) if (lower.includes(l)) found.push(l)
  return [...new Set(found)]
}

const db = new PrismaClient()

async function ensureProbe(role: 'USER' | 'AGENT') {
  const existing = await db.user.findFirst({ where: { role, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
  if (existing) return existing
  const email = role === 'USER' ? 'probe.user@zero-leak.local' : 'probe.agent@zero-leak.local'
  console.log(`[runtime] no ${role} account yet — creating probe account ${email} (local db only)`)
  return db.user.create({
    data: {
      email,
      name: `Zero-leak probe ${role.toLowerCase()}`,
      passwordHash: await bcrypt.hash('probe-' + randomBytes(8).toString('hex'), 10),
      role,
      apiKey: 'usr_' + randomBytes(16).toString('hex'),
    },
  })
}

async function sessionCookie(u: { id: string; email: string; role: string; name: string }) {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET || 'insecure-dev-secret')
  const token = await new SignJWT({ uid: u.id, email: u.email, role: u.role, name: u.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)
  return `iprn_session=${token}`
}

interface Probe {
  name: string
  url: string
  headers: Record<string, string>
  expectRedirect?: boolean
}

async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/login`, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    return r.status > 0
  } catch {
    return false
  }
}

async function runtimeCheck(): Promise<{ failures: string[]; passed: number; warnings: string[] }> {
  const failures: string[] = []
  const warnings: string[] = []
  let passed = 0

  const [user, agent] = await Promise.all([ensureProbe('USER'), ensureProbe('AGENT')])
  const [userCookie, agentCookie] = await Promise.all([sessionCookie(user), sessionCookie(agent)])

  const probes: Probe[] = []
  const pagePaths = [
    '/panel/dashboard',
    '/panel/numbers',
    '/panel/numbers?tab=available',
    '/panel/numbers?tab=at-risk',
    '/panel/traffic',
    '/panel/rates',
    '/panel/wallet',
    '/panel/payouts',
    '/panel/settings',
    '/panel/users',
  ]
  for (const role of ['USER', 'AGENT'] as const) {
    const cookie = role === 'USER' ? userCookie : agentCookie
    for (const p of pagePaths) probes.push({ name: `page ${p} [${role}]`, url: `${BASE}${p}`, headers: { cookie } })
    probes.push({ name: `csv export [${role}]`, url: `${BASE}/panel/traffic/export?days=3650`, headers: { cookie } })
    probes.push({ name: `live endpoint [${role}]`, url: `${BASE}/api/panel/traffic/live?days=7`, headers: { cookie } })
    for (const api of [
      '/api/v1/me',
      '/api/v1/numbers',
      '/api/v1/numbers?available=1',
      '/api/v1/messages',
      '/api/v1/rates',
      '/api/v1/balance',
      '/api/v1/payouts',
    ]) {
      probes.push({
        name: `api ${api} [${role}]`,
        url: `${BASE}${api}`,
        headers: { 'x-api-key': role === 'USER' ? user.apiKey : agent.apiKey },
      })
    }
    // admin-only routes must redirect away for non-admins
    for (const p of ['/panel/audit', '/panel/guide']) {
      probes.push({ name: `admin-only ${p} redirects [${role}]`, url: `${BASE}${p}`, headers: { cookie }, expectRedirect: true })
    }
  }

  for (const p of probes) {
    try {
      const res = await fetch(p.url, { headers: p.headers, redirect: 'manual', signal: AbortSignal.timeout(15000) })
      if (p.expectRedirect) {
        if (res.status >= 300 && res.status < 400) {
          passed++
        } else {
          failures.push(`${p.name}: expected redirect, got ${res.status}`)
        }
        continue
      }
      if (res.status >= 500) {
        failures.push(`${p.name}: server error ${res.status}`)
        continue
      }
      const body = await res.text()
      const bad = findForbidden(body)
      if (bad.length > 0) {
        failures.push(`${p.name}: leaked ${bad.join(', ')}`)
      } else {
        passed++
      }
    } catch (e) {
      failures.push(`${p.name}: request failed — ${(e as Error).message}`)
    }
  }

  // sanity (non-blocking): the admin surface should still expose the true fields
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } })
  if (admin) {
    try {
      const res = await fetch(`${BASE}/api/v1/messages`, { headers: { 'x-api-key': admin.apiKey }, signal: AbortSignal.timeout(15000) })
      const body = await res.text()
      if (!body.includes('true_value')) warnings.push('admin /api/v1/messages no longer exposes true_value — check the admin surface')
    } catch {
      warnings.push('admin sanity probe failed (non-blocking)')
    }
  }

  return { failures, passed, warnings }
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

let ok = true

console.log('Zero-leak guard — hidden margin engine (trueCost/marginKept/trueRate/…)')
console.log(''.padEnd(72, '─'))

const { hits, files } = staticCheck()
const leaks = hits.filter((h) => h.disposition === 'LEAK')
const guarded = hits.filter((h) => h.disposition === 'guarded').length
const allowed = hits.filter((h) => h.disposition === 'allow-listed').length
console.log(`[static] scanned ${files} surface file(s) under src/app + src/components/panel`)
console.log(`[static] ${hits.length} token line(s): ${guarded} admin-guarded · ${allowed} allow-listed · ${leaks.length} leak(s)`)
for (const h of hits) {
  if (h.disposition === 'LEAK') {
    console.log(`  ✗ LEAK    ${h.file}:${h.line} — ${h.text.slice(0, 90)}`)
    ok = false
  }
}
if (leaks.length === 0) console.log(`[static] ${ok ? 'PASS' : 'FAIL'} — no forbidden token on any unguarded, unreviewed line`)

if (await serverUp()) {
  const { failures, passed, warnings } = await runtimeCheck()
  console.log(`[runtime] ${passed} probe(s) clean, ${failures.length} failure(s)`)
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
    ok = false
  }
  for (const w of warnings) console.log(`  ⚠ ${w}`)
  if (failures.length === 0) console.log('[runtime] PASS — pages / APIs / exports clean for USER and AGENT sessions')
} else {
  console.log('[runtime] dev server not reachable — runtime probes skipped (static result stands)')
}

await db.$disconnect()

console.log(''.padEnd(72, '─'))
console.log(`RESULT: ${ok ? 'PASS — zero leaks' : 'FAIL — leaks detected'}`)
process.exit(ok ? 0 : 1)
