import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { gatewayStatus, gatewayListening } from '@/lib/smpp/gateway'
import { fmtMoney, fmtDateTime, timeAgo, trafficState } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Kpi } from '@/components/panel/kpi'
import { CountdownBadge } from '@/components/panel/countdown-badge'
import { EarningsChart, ClassBars, TrafficVolumeChart, type DayPoint } from '@/components/panel/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Hash, MessageSquareText, DollarSign, Users, AlertTriangle, Radio,
  Landmark, Activity, TrendingUp, Webhook,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const DAY = 86400000

interface Agg {
  count: number
  trueValue: number
  userEarning: number
  marginKept: number
  simulated: number
}

function aggregate<T extends { simulated: boolean; trueCost: number; userEarning: number; marginKept: number }>(
  rows: T[]
): Agg {
  const a: Agg = { count: 0, trueValue: 0, userEarning: 0, marginKept: 0, simulated: 0 }
  for (const r of rows) {
    if (r.simulated) {
      a.simulated++
      continue
    }
    a.count++
    a.trueValue += r.trueCost
    a.userEarning += r.userEarning
    a.marginKept += r.marginKept
  }
  return a
}

function byDay<T extends { receivedAt: Date; simulated: boolean; trueCost: number; userEarning: number; marginKept: number }>(
  rows: T[],
  includeMargin = true
): DayPoint[] {
  // internal accumulator keeps the admin-only fields non-optional; they are
  // stripped from the returned points for non-admin callers (see below)
  const map = new Map<string, { day: string; userEarning: number; marginKept: number; trueValue: number; count: number }>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10)
    map.set(d, { day: d, userEarning: 0, marginKept: 0, trueValue: 0, count: 0 })
  }
  for (const r of rows) {
    if (r.simulated) continue
    const key = new Date(r.receivedAt).toISOString().slice(0, 10)
    const p = map.get(key)
    if (!p) continue
    p.userEarning += r.userEarning
    p.marginKept += r.marginKept
    p.trueValue += r.trueCost
    p.count += 1
  }
  // non-admin chart payloads omit the margin/true keys entirely: neither the
  // names nor the values ever transit to a USER or AGENT browser
  return [...map.values()].map((p) =>
    includeMargin
      ? { day: p.day, userEarning: +p.userEarning.toFixed(4), marginKept: +p.marginKept.toFixed(4), trueValue: +p.trueValue.toFixed(4), count: p.count }
      : { day: p.day, userEarning: +p.userEarning.toFixed(4), count: p.count }
  )
}

function classSplit<T extends { class: string; simulated: boolean }>(rows: T[]) {
  let p2p = 0
  let a2p = 0
  for (const r of rows) {
    if (r.simulated) continue
    if (r.class === 'A2P') a2p++
    else p2p++
  }
  return { p2p, a2p }
}

export default async function DashboardPage() {
  const session = await requireSession()
  const settings = await getSettings()
  const currency = settings.currency || 'USD'
  const since14 = new Date(Date.now() - 13 * DAY)
  const since7 = new Date(Date.now() - 6 * DAY)
  const since24 = new Date(Date.now() - DAY)

  // ───────────────────────────── ADMIN ─────────────────────────────
  if (session.role === 'ADMIN') {
    const rows = await db.message.findMany({
      where: { receivedAt: { gte: since14 }, deletedAt: null },
      include: { did: { select: { destination: true } } },
      orderBy: { receivedAt: 'asc' },
    })
    const recent14 = rows
    const recent7 = rows.filter((r) => r.receivedAt >= since7)
    const recent24 = rows.filter((r) => r.receivedAt >= since24)
    const agg7 = aggregate(recent7)
    const agg24 = aggregate(recent24)

    const [userCount, assignedNumbers, availableNumbers, nonAdminUsers, pendingPayouts, unpriced] = await Promise.all([
      db.user.count(),
      db.did.count({ where: { status: 'ASSIGNED' } }),
      db.did.count({ where: { status: 'AVAILABLE' } }),
      db.user.findMany({ where: { role: { not: 'ADMIN' } }, select: { id: true, name: true, email: true, role: true, walletBalance: true, marginPercent: true } }),
      db.payoutRequest.findMany({ where: { status: 'PENDING' } }),
      db.message.count({ where: { billingStatus: 'UNPRICED', deletedAt: null } }),
    ])

    const agentUsers = nonAdminUsers.filter((u) => u.role === 'AGENT')

    // top users & destinations (7d, non-simulated)
    const byUser = new Map<string, { earning: number; margin: number; count: number }>()
    const byDest = new Map<string, { value: number; count: number }>()
    for (const r of recent7) {
      if (r.simulated) continue
      if (r.userId) {
        const cur = byUser.get(r.userId) ?? { earning: 0, margin: 0, count: 0 }
        cur.earning += r.userEarning
        cur.margin += r.marginKept
        cur.count++
        byUser.set(r.userId, cur)
      }
      const dest = r.did?.destination || 'Unmatched'
      const cd = byDest.get(dest) ?? { value: 0, count: 0 }
      cd.value += r.trueCost
      cd.count++
      byDest.set(dest, cd)
    }
    const topUsers = [...byUser.entries()]
      .sort((a, b) => b[1].earning - a[1].earning)
      .slice(0, 6)
      .map(([id, v]) => ({ user: nonAdminUsers.find((u) => u.id === id), ...v }))
    const topDests = [...byDest.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 6)

    // agent commissions paid (7d) from ledger
    const commTxs = await db.transaction.findMany({ where: { type: 'COMMISSION', createdAt: { gte: since7 } } })
    const commissionsPaid7 = commTxs.reduce((s, t) => s + t.amount, 0)

    const liability =
      nonAdminUsers.reduce((s, u) => s + u.walletBalance, 0) + pendingPayouts.reduce((s, p) => s + p.net, 0)

    const dangerNumbers = await db.did.findMany({ where: { status: 'ASSIGNED' } })
    const danger = dangerNumbers.filter((d) => trafficState(d.lastTrafficAt, d.assignedAt).level === 'DANGER')

    // ── Platform link status (admin) ──
    const gw = gatewayStatus()
    const gwListening = await gatewayListening()
    const lastEvent = await db.rawEvent.findFirst({ orderBy: { receivedAt: 'desc' } })
    const webhookReady = !!(settings.public_url && settings.mo_webhook_secret)

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform-wide traffic, margin and liability overview.</p>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Kpi label="Messages (7d)" value={String(agg7.count)} sub={`${agg24.count} in last 24h · ${agg7.simulated} simulated excluded`} icon={MessageSquareText} />
          <Kpi label="True value (7d)" value={fmtMoney(agg7.trueValue, currency)} sub="what the upstream platform settles" icon={DollarSign} />
          <Kpi label="Margin kept (7d)" value={fmtMoney(agg7.marginKept, currency)} sub={`commissions paid ${fmtMoney(commissionsPaid7, currency)}`} icon={TrendingUp} tone="money" />
          <Kpi label="Payout liability" value={fmtMoney(liability, currency)} sub={`${pendingPayouts.length} pending request(s) · user balances included`} icon={Landmark} tone="warn" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Earnings — last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              <EarningsChart data={byDay(recent14)} showMargin />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Platform link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Radio className={cn('size-4 mt-0.5 shrink-0', gwListening ? 'text-emerald-600' : 'text-destructive')} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">SMPP gateway {gwListening ? `listening :${gw.port || settings.smpp_port || '2775'}` : 'not started'}</p>
                    <p className="text-xs text-muted-foreground">
                      {gw.upstreamConnected ? 'upstream platform bound' : 'awaiting upstream platform bind'}
                      {gw.userBindCount > 0 ? ` · ${gw.userBindCount} user bind(s)` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Webhook className={cn('size-4 mt-0.5 shrink-0', webhookReady ? 'text-emerald-600' : 'text-amber-600 dark:text-amber-400')} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">Vendor-copy MO webhook {webhookReady ? 'configured' : 'incomplete'}</p>
                    <p className="text-xs text-muted-foreground">
                      {settings.public_url ? 'public URL set' : 'public URL missing'} ·{' '}
                      {settings.mo_webhook_secret ? 'secret set' : 'secret missing'} — Settings → Upstream
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Activity className="size-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">
                      Last raw event: {lastEvent ? `${lastEvent.source} · ${timeAgo(lastEvent.receivedAt)}` : 'none yet'}
                    </p>
                    {lastEvent && <p className="text-xs text-muted-foreground">{fmtDateTime(lastEvent.receivedAt)}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Hash className="size-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">{assignedNumbers} sourced number(s)</p>
                    <p className="text-xs text-muted-foreground">{availableNumbers} available in the pool</p>
                  </div>
                </div>
                <div className={cn('flex items-start gap-2', danger.length > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {danger.length} number(s) at risk (≤3 days left of the 7-day rule)
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-1 h-7 text-xs">
                      <Link href="/panel/numbers?tab=at-risk">Review at-risk numbers</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Traffic by class (7d)</CardTitle>
              </CardHeader>
              <CardContent>
                <ClassBars {...classSplit(recent7)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">System</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2"><Radio className="size-4 text-muted-foreground" aria-hidden /> SMPP gateway :{gw.started ? gw.port : settings.smpp_port || '2775'} · egress allowlist 35.224.28.251</p>
                <p className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" aria-hidden /> {userCount} accounts · {agentUsers.length} agent(s)</p>
                <p className="flex items-center gap-2"><Hash className="size-4 text-muted-foreground" aria-hidden /> {assignedNumbers} assigned · {availableNumbers} available numbers</p>
                {unpriced > 0 && (
                  <p className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-4" aria-hidden /> {unpriced} unpriced message(s) — set true rates
                  </p>
                )}
                {danger.length > 0 && (
                  <p className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="size-4" aria-hidden /> {danger.length} number(s) past the 7-day traffic rule
                  </p>
                )}
                <Button asChild variant="outline" size="sm" className="mt-1">
                  <Link href="/panel/guide">Open setup guide</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top users (7d)</CardTitle>
            </CardHeader>
            <CardContent>
              {topUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No user traffic yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">User</th>
                      <th className="pb-2 font-medium text-right">Their earnings</th>
                      <th className="pb-2 font-medium text-right">Margin on them</th>
                      <th className="pb-2 font-medium text-right">Msgs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUsers.map((t) => (
                      <tr key={t.user?.id ?? t.earning} className="border-t">
                        <td className="py-2">{t.user?.name ?? 'deleted user'} <span className="text-xs text-muted-foreground">{t.user?.role === 'AGENT' ? '(agent)' : ''}</span></td>
                        <td className="py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(t.earning, currency)}</td>
                        <td className="py-2 text-right tabular-nums">{fmtMoney(t.margin, currency)}</td>
                        <td className="py-2 text-right tabular-nums">{t.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top destinations (7d)</CardTitle>
            </CardHeader>
            <CardContent>
              {topDests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No traffic yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Destination</th>
                      <th className="pb-2 font-medium text-right">True value</th>
                      <th className="pb-2 font-medium text-right">Msgs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDests.map(([dest, v]) => (
                      <tr key={dest} className="border-t">
                        <td className="py-2">{dest}</td>
                        <td className="py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(v.value, currency)}</td>
                        <td className="py-2 text-right tabular-nums">{v.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ───────────────────────────── AGENT ─────────────────────────────
  if (session.role === 'AGENT') {
    const myUsers = await db.user.findMany({ where: { parentId: session.uid }, select: { id: true } })
    const ids = myUsers.map((u) => u.id)
    const rows = await db.message.findMany({
      where: { userId: { in: ids }, receivedAt: { gte: since14 }, deletedAt: null },
      orderBy: { receivedAt: 'asc' },
    })
    const recent7 = rows.filter((r) => r.receivedAt >= since7)
    const agg7 = aggregate(recent7)
    const commTxs = await db.transaction.findMany({ where: { userId: session.uid, type: 'COMMISSION', createdAt: { gte: since14 } } })
    const commission7 = commTxs.filter((t) => t.createdAt >= since7).reduce((s, t) => s + t.amount, 0)
    const pendingCount = await db.payoutRequest.count({ where: { userId: { in: ids }, status: 'PENDING' } })
    const me = await db.user.findUnique({ where: { id: session.uid } })

    const byUser = new Map<string, { earning: number; count: number }>()
    for (const r of recent7) {
      if (r.simulated || !r.userId) continue
      const cur = byUser.get(r.userId) ?? { earning: 0, count: 0 }
      cur.earning += r.userEarning
      cur.count++
      byUser.set(r.userId, cur)
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent dashboard</h1>
          <p className="text-sm text-muted-foreground">Your sub-users, their traffic and your commission.</p>
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Kpi label="My sub-users" value={String(ids.length)} icon={Users} />
          <Kpi label="Their messages (7d)" value={String(agg7.count)} icon={MessageSquareText} />
          <Kpi label="Their earnings (7d)" value={fmtMoney(agg7.userEarning, currency)} sub="paid at their rates" icon={Activity} tone="money" />
          <Kpi label="My commission (7d)" value={fmtMoney(commission7, currency)} sub={`balance ${fmtMoney(me?.walletBalance ?? 0, currency)}`} icon={DollarSign} tone="money" />
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sub-user traffic — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            {/* sanitized: margin/true values are zeroed for non-admin chart payloads */}
            <EarningsChart data={byDay(rows, false)} showMargin={false} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sub-users (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            {byUser.size === 0 ? (
              <p className="text-sm text-muted-foreground">No sub-user traffic yet. {pendingCount} pending payout request(s).</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium text-right">Earnings (7d)</th>
                    <th className="pb-2 font-medium text-right">Msgs</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byUser.entries()].map(([id, v]) => {
                    const u = myUsers.find((x) => x.id === id)!
                    return (
                      <tr key={id} className="border-t">
                        <td className="py-2">{u.id.slice(0, 8)}</td>
                        <td className="py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(v.earning, currency)}</td>
                        <td className="py-2 text-right tabular-nums">{v.count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ───────────────────────────── USER ─────────────────────────────
  const me = await db.user.findUnique({ where: { id: session.uid } })
  const rows = await db.message.findMany({
    where: { userId: session.uid, receivedAt: { gte: since14 }, deletedAt: null },
    include: { did: { select: { destination: true } } },
    orderBy: { receivedAt: 'asc' },
  })
  const recent7 = rows.filter((r) => r.receivedAt >= since7)
  const recent24 = rows.filter((r) => r.receivedAt >= since24)
  const agg7 = aggregate(recent7)
  const agg24 = aggregate(recent24)
  const myNumbers = await db.did.findMany({ where: { assignedUserId: session.uid }, take: 12, orderBy: { lastTrafficAt: 'desc' } })
  const latest = [...rows].reverse().slice(0, 8)
  const scheduleNote =
    me?.payoutSchedule === 'WEEKLY'
      ? 'Fast payout schedule — weekly factoring fee applies on each payout.'
      : 'Standard monthly payout schedule — no factoring fee.'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My dashboard</h1>
        <p className="text-sm text-muted-foreground">Your premium numbers, inbound traffic and earnings.</p>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label="My numbers" value={String(myNumbers.length)} icon={Hash} />
        <Kpi label="Messages (7d)" value={String(agg7.count)} sub={`${agg24.count} in last 24h`} icon={MessageSquareText} />
        <Kpi label="My earnings (7d)" value={fmtMoney(agg7.userEarning, currency)} sub="at your rates" icon={DollarSign} tone="money" />
        <Kpi label="My balance" value={fmtMoney(me?.walletBalance ?? 0, currency)} sub={scheduleNote} icon={Landmark} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My earnings — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            {/* sanitized: margin/true values are zeroed for non-admin chart payloads */}
            <EarningsChart data={byDay(rows, false)} showMargin={false} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Traffic by class (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <ClassBars {...classSplit(recent7)} />
            <TrafficVolumeChart data={byDay(rows, false)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My numbers — 7-day traffic rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myNumbers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No numbers assigned yet — browse available numbers.</p>
            ) : (
              <ul className="space-y-2">
                {myNumbers.slice(0, 8).map((d) => {
                  const t = trafficState(d.lastTrafficAt, d.assignedAt)
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-2">
                      <span className="font-mono text-xs">+{d.number}</span>
                      <span className="text-xs text-muted-foreground truncate">{d.destination}</span>
                      <CountdownBadge state={t} />
                    </li>
                  )
                })}
              </ul>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/panel/numbers?tab=available">Browse available numbers</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Latest inbound</CardTitle>
          </CardHeader>
          <CardContent>
            {latest.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inbound traffic yet.</p>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {latest.map((m) => (
                  <li key={m.id} className="text-sm border rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{m.numberFrom} → <span className="font-mono">+{m.numberTo}</span></span>
                      <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                        {m.simulated ? 'simulated' : fmtMoney(m.userEarning, currency)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{m.text}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{fmtDateTime(m.receivedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
