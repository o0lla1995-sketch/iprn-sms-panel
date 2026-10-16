import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings, getBool } from '@/lib/settings'
import { fmtRate, fmtMoney, trafficState } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CountdownBadge } from '@/components/panel/countdown-badge'
import { addNumbers, rentNumber, releaseNumber, assignNumber, updateNumber } from './actions'
import { ImportNumbersCard } from './import-form'
import { AlertTriangle, ArrowUpRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const DAY = 86400000

export default async function NumbersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const sp = await searchParams
  const tab = String(sp.tab || (session.role === 'ADMIN' ? 'all' : 'mine'))
  const q = String(sp.q || '').toLowerCase()
  const destFilter = String(sp.dest || '')
  const clsFilter = String(sp.cls || '')

  const settings = await getSettings()
  const selfService = session.role === 'USER' ? await getBool('self_service_numbers', true) : true
  const isAdmin = session.role === 'ADMIN'
  const currency = settings.currency || 'USD'

  // agent sub-users are needed for both scoping and earnings
  const agentKids =
    session.role === 'AGENT'
      ? (await db.user.findMany({ where: { parentId: session.uid }, select: { id: true } })).map((k) => k.id)
      : []

  // ── scope (role × tab) ─────────────────────────────────────────────
  let baseWhere: Record<string, unknown> = {}
  if (tab === 'available') {
    baseWhere = { status: 'AVAILABLE' }
  } else if (tab === 'at-risk') {
    baseWhere = { status: 'ASSIGNED' }
    if (session.role === 'USER') baseWhere.assignedUserId = session.uid
    else if (session.role === 'AGENT') baseWhere.assignedUserId = { in: agentKids }
  } else if (session.role === 'USER') {
    baseWhere = { assignedUserId: session.uid }
  } else if (session.role === 'AGENT') {
    baseWhere = { assignedUserId: { in: agentKids } }
  }

  // ── filters (search + destination + class) ─────────────────────────
  const where: Record<string, unknown> = { ...baseWhere }
  if (q) where.OR = [{ number: { contains: q } }, { destination: { contains: q } }]
  if (destFilter) where.destination = destFilter
  if (clsFilter === 'P2P' || clsFilter === 'A2P' || clsFilter === 'BOTH') where.class = clsFilter

  // viewer margin: users viewing the pool see THEIR derived rate — never the true rate
  const viewer = session.role === 'USER' ? await db.user.findUnique({ where: { id: session.uid }, select: { marginPercent: true } }) : null
  const viewerMargin = viewer?.marginPercent ?? Number(settings.default_margin || 30)

  let rows = await db.did.findMany({
    where,
    include: { assignedUser: { select: { id: true, name: true, email: true, marginPercent: true, role: true } } },
    orderBy: { number: 'asc' },
    take: 400,
  })

  // at-risk view: assigned numbers with ≤3 days left of the 7-day no-traffic auto-release
  if (tab === 'at-risk') {
    rows = rows.filter((d) => trafficState(d.lastTrafficAt, d.assignedAt).level === 'DANGER')
  }

  // destination filter options (distinct destinations within the current scope)
  const destRows = await db.did.findMany({ where: baseWhere, select: { destination: true }, distinct: ['destination'] })
  const destOptions = destRows.map((r) => r.destination).filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 300)

  // ── per-number stats: traffic last 24h / 7d + earnings (7d) ────────
  // earnings are scoped to the viewer (users/agents only ever see derived earnings)
  const earnScope: string[] | null = isAdmin ? null : session.role === 'AGENT' ? agentKids : [session.uid]
  const cnt24 = new Map<string, number>()
  const cnt7 = new Map<string, number>()
  const earn7 = new Map<string, number>()
  const adminTrue7 = new Map<string, number>()
  const adminMargin7 = new Map<string, number>()
  if (rows.length > 0) {
    const didIds = rows.map((d) => d.id)
    const w7: Record<string, unknown> = {
      deletedAt: null,
      didId: { in: didIds },
      receivedAt: { gte: new Date(Date.now() - 7 * DAY) },
      ...(earnScope ? { userId: { in: earnScope } } : {}),
    }
    const [g24, g7, adminAgg] = await Promise.all([
      db.message.groupBy({ by: ['didId'], where: { ...w7, receivedAt: { gte: new Date(Date.now() - DAY) } }, _count: { _all: true } }),
      db.message.groupBy({ by: ['didId'], where: w7, _count: { _all: true }, _sum: { userEarning: true } }),
      isAdmin ? db.message.groupBy({ by: ['didId'], where: w7, _sum: { trueCost: true, marginKept: true } }) : Promise.resolve([]),
    ])
    for (const g of g24) cnt24.set(g.didId ?? '', g._count._all)
    for (const g of g7) {
      cnt7.set(g.didId ?? '', g._count._all)
      earn7.set(g.didId ?? '', g._sum.userEarning ?? 0)
    }
    // admin-only aggregates (rendered exclusively inside isAdmin cells below)
    const adminSums = adminAgg as { didId: string | null; _sum: { trueCost: number | null; marginKept: number | null } }[]
    for (const g of adminSums) { adminTrue7.set(g.didId ?? '', g._sum.trueCost ?? 0); adminMargin7.set(g.didId ?? '', g._sum.marginKept ?? 0) }
  }

  const activeUsers = isAdmin
    ? await db.user.findMany({ where: { role: { in: ['USER', 'AGENT'] }, status: 'ACTIVE' }, select: { id: true, name: true, email: true, role: true } })
    : []

  const tabs: { key: string; label: string }[] =
    session.role === 'ADMIN'
      ? [
          { key: 'all', label: 'All numbers' },
          { key: 'available', label: 'Available pool' },
          { key: 'at-risk', label: 'At risk (≤3d)' },
        ]
      : session.role === 'AGENT'
        ? [
            { key: 'mine', label: "Sub-users' numbers" },
            { key: 'available', label: 'Available pool' },
            { key: 'at-risk', label: 'At risk (≤3d)' },
          ]
        : [
            { key: 'mine', label: 'My numbers' },
            { key: 'available', label: 'Rent a number' },
            { key: 'at-risk', label: 'At risk (≤3d)' },
          ]

  const columnCount = isAdmin ? 11 : 9

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Numbers</h1>
          <p className="text-sm text-muted-foreground">
            Premium DIDs · inbound P2P/A2P traffic · 7-day rule: no inbound for 7 days and the number is un-sourced upstream.
          </p>
        </div>
        <form className="flex flex-wrap gap-2" action="/panel/numbers">
          <input type="hidden" name="tab" value={tab} />
          <div>
            <label htmlFor="q" className="sr-only">Search</label>
            <Input id="q" name="q" defaultValue={String(sp.q || '')} placeholder="Search number or destination…" className="w-48" />
          </div>
          <div>
            <label htmlFor="dest" className="sr-only">Destination</label>
            <select
              id="dest"
              name="dest"
              defaultValue={destFilter}
              className="h-9 max-w-48 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All destinations</option>
              {destOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cls" className="sr-only">Class</label>
            <select
              id="cls"
              name="cls"
              defaultValue={clsFilter}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All classes</option>
              <option value="P2P">P2P</option>
              <option value="A2P">A2P</option>
              <option value="BOTH">BOTH</option>
            </select>
          </div>
          <Button variant="outline" type="submit">Filter</Button>
        </form>
      </div>

      <div className="flex gap-2 flex-wrap" role="tablist">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/panel/numbers?tab=${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm min-h-[36px] inline-flex items-center',
              tab === t.key ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'at-risk' && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2"
        >
          <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>{rows.length}</strong> number(s) within 3 days of the 7-day no-traffic auto-release.
            Get inbound traffic to them — upstream emails 3 days before an automatic un-source.
          </span>
        </div>
      )}

      {isAdmin && tab === 'all' && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addNumbers as unknown as (formData: FormData) => void} className="space-y-3" id="add-numbers">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="numbers">Bulk list — one per line</Label>
                    <textarea
                      id="numbers"
                      name="numbers"
                      required
                      rows={4}
                      className="font-mono text-xs flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 shadow-xs"
                      placeholder={'213562242832,Algeria Azure,0.0120,BOTH\n213562242833,Algeria Azure,0.0120\nor paste the upstream export — columns are auto-mapped'}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="destination">Fallback destination</Label>
                      <Input id="destination" name="destination" placeholder="e.g. Algeria Azure" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rate">Fallback true rate ({currency})</Label>
                      <Input id="rate" name="rate" type="number" step="0.0001" min="0" placeholder="0.0120" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      True rate is the upstream vendor rate — visible to admins only; users see it minus their margin.
                    </p>
                  </div>
                </div>
                <Button type="submit" variant="outline">Import list</Button>
              </form>
            </CardContent>
          </Card>

          <ImportNumbersCard currency={currency} />
        </>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">{isAdmin ? 'True rate' : 'Your rate/msg'}</th>
                  {isAdmin && <th className="px-4 py-3 font-medium">User rate</th>}
                  {isAdmin && <th className="px-4 py-3 font-medium">Margin</th>}
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Last traffic</th>
                  <th className="px-4 py-3 font-medium" title="Messages in the last 24 hours / 7 days">Traffic 24h/7d</th>
                  <th className="px-4 py-3 font-medium">{isAdmin ? 'Earnings 7d (user/margin/true)' : 'Your earnings (7d)'}</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={columnCount} className="px-4 py-8 text-center text-muted-foreground">
                      No numbers here yet. {session.role === 'USER' && tab === 'mine' && 'Rent one from the pool tab.'}
                    </td>
                  </tr>
                )}
                {rows.map((d) => {
                  const t = trafficState(d.lastTrafficAt, d.assignedAt)
                  const ownerMargin = d.assignedUser ? d.assignedUser.marginPercent : viewerMargin
                  const userRate = d.trueRate * (1 - ownerMargin / 100)
                  const c24 = cnt24.get(d.id) ?? 0
                  const c7 = cnt7.get(d.id) ?? 0
                  const e7 = earn7.get(d.id) ?? 0
                  return (
                    <tr key={d.id} className="border-b last:border-0 align-middle hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">+{d.number}</td>
                      <td className="px-4 py-2.5">{d.destination}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline">{d.class}</Badge>
                      </td>
                      <td className={cn('px-4 py-2.5 tabular-nums', isAdmin ? '' : 'text-emerald-600 dark:text-emerald-400 font-medium')}>
                        {fmtRate(isAdmin ? d.trueRate : userRate)}
                      </td>
                      {isAdmin && (
                        <>
                          <td className="px-4 py-2.5 tabular-nums text-emerald-600 dark:text-emerald-400">
                            {d.assignedUser ? fmtRate(userRate) : '—'}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-amber-600 dark:text-amber-400">
                            {d.assignedUser ? `${ownerMargin}%` : '—'}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-xs">
                        {d.assignedUser ? (
                          <>
                            {d.assignedUser.name}
                            <span className="text-muted-foreground"> · {d.assignedUser.role.toLowerCase()}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">in pool</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <CountdownBadge state={t} inPool={d.status === 'AVAILABLE'} />
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-xs whitespace-nowrap">
                        <span className={c24 > 0 ? '' : 'text-muted-foreground'}>{c24}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className={c7 > 0 ? '' : 'text-muted-foreground'}>{c7}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-xs whitespace-nowrap">
                        {isAdmin ? (
                          <span className="inline-flex flex-col leading-tight" title="user earnings / margin kept / true value — last 7 days">
                            <span className="text-emerald-600 dark:text-emerald-400">{fmtMoney(e7, currency)}</span>
                            <span className="text-amber-600 dark:text-amber-400">+{fmtMoney(adminMargin7.get(d.id) ?? 0, currency)}</span>
                            <span className="text-muted-foreground">{fmtMoney(adminTrue7.get(d.id) ?? 0, currency)}</span>
                          </span>
                        ) : (
                          <span className={cn('font-medium', e7 > 0 && 'text-emerald-600 dark:text-emerald-400')}>
                            {fmtMoney(e7, currency)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {d.status === 'AVAILABLE' && session.role === 'USER' && selfService && (
                            <form action={rentNumber as unknown as (formData: FormData) => void}>
                              <input type="hidden" name="id" value={d.id} />
                              <Button size="sm">
                                Rent this number <ArrowUpRight className="size-3.5" />
                              </Button>
                            </form>
                          )}
                          {d.status === 'AVAILABLE' && session.role === 'AGENT' && (
                            <span className="text-xs text-muted-foreground py-1.5">read-only</span>
                          )}
                          {d.status === 'ASSIGNED' && isAdmin && (
                            <form action={releaseNumber as unknown as (formData: FormData) => void}>
                              <input type="hidden" name="id" value={d.id} />
                              <Button size="sm" variant="ghost">Release</Button>
                            </form>
                          )}
                          {d.status === 'ASSIGNED' && session.role === 'USER' && d.assignedUserId === session.uid && (
                            <form action={releaseNumber as unknown as (formData: FormData) => void}>
                              <input type="hidden" name="id" value={d.id} />
                              <Button size="sm" variant="ghost">Release</Button>
                            </form>
                          )}
                          {d.status === 'AVAILABLE' && isAdmin && (
                            <details className="inline">
                              <summary className="cursor-pointer list-none text-xs text-muted-foreground underline inline py-1.5">
                                assign / edit
                              </summary>
                              <div className="mt-2 rounded-lg border p-3 bg-card shadow-lg w-72 space-y-2 z-50">
                                <form action={assignNumber as unknown as (formData: FormData) => void} className="space-y-2">
                                  <input type="hidden" name="id" value={d.id} />
                                  <Label className="text-xs">Assign to user</Label>
                                  <Select name="userId" required>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose user" /></SelectTrigger>
                                    <SelectContent>
                                      {activeUsers.map((u) => (
                                        <SelectItem key={u.id} value={u.id} className="text-xs">
                                          {u.name} ({u.email})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button size="sm" type="submit" className="w-full">Assign</Button>
                                </form>
                                <hr />
                                <form action={updateNumber as unknown as (formData: FormData) => void} className="space-y-2">
                                  <input type="hidden" name="id" value={d.id} />
                                  <Label className="text-xs">True rate / destination / class</Label>
                                  <Input name="trueRate" type="number" step="0.0001" min="0" defaultValue={d.trueRate} className="h-8 text-xs" />
                                  <Input name="destination" defaultValue={d.destination} className="h-8 text-xs" />
                                  <Select name="class" defaultValue={d.class}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="BOTH">BOTH</SelectItem>
                                      <SelectItem value="P2P">P2P</SelectItem>
                                      <SelectItem value="A2P">A2P</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input name="note" defaultValue={d.note ?? ''} placeholder="note" className="h-8 text-xs" />
                                  <Button size="sm" type="submit" variant="outline" className="w-full">Save</Button>
                                </form>
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="size-3.5" aria-hidden />
        Any inbound message resets the 7-day clock. Upstream emails 3 days before an automatic un-source.
      </p>
    </div>
  )
}
