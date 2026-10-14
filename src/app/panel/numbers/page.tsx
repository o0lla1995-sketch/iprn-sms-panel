import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings, getBool } from '@/lib/settings'
import { fmtRate, trafficState } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { addNumbers, rentNumber, releaseNumber, assignNumber, updateNumber } from './actions'
import { AlertTriangle, ArrowUpRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NumbersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const sp = await searchParams
  const tab = String(sp.tab || (session.role === 'ADMIN' ? 'all' : 'mine'))
  const q = String(sp.q || '').toLowerCase()

  const settings = await getSettings()
  const selfService = session.role === 'USER' ? await getBool('self_service_numbers', true) : true
  const isAdmin = session.role === 'ADMIN'
  const currency = settings.currency || 'USD'

  // scope
  let where: Record<string, unknown> = {}
  if (session.role === 'USER') {
    where = tab === 'available' ? { status: 'AVAILABLE' } : { assignedUserId: session.uid }
  } else if (session.role === 'AGENT') {
    const kids = await db.user.findMany({ where: { parentId: session.uid }, select: { id: true } })
    where = tab === 'available' ? { status: 'AVAILABLE' } : { assignedUserId: { in: kids.map((k) => k.id) } }
  } else {
    where = tab === 'available' ? { status: 'AVAILABLE' } : {}
  }
  if (q) where.number = { contains: q }

  // viewer margin: users viewing the pool see THEIR derived rate — never the true rate
  const viewer = session.role === 'USER' ? await db.user.findUnique({ where: { id: session.uid }, select: { marginPercent: true } }) : null
  const viewerMargin = viewer?.marginPercent ?? Number(settings.default_margin || 30)

  const rows = await db.did.findMany({
    where,
    include: { assignedUser: { select: { id: true, name: true, email: true, marginPercent: true, role: true } } },
    orderBy: { number: 'asc' },
    take: 400,
  })

  const activeUsers = isAdmin
    ? await db.user.findMany({ where: { role: { in: ['USER', 'AGENT'] }, status: 'ACTIVE' }, select: { id: true, name: true, email: true, role: true } })
    : []

  const tabs: { key: string; label: string }[] =
    session.role === 'ADMIN'
      ? [
          { key: 'all', label: 'All numbers' },
          { key: 'available', label: 'Available pool' },
        ]
      : session.role === 'AGENT'
        ? [
            { key: 'mine', label: "Sub-users' numbers" },
            { key: 'available', label: 'Available pool' },
          ]
        : [
            { key: 'mine', label: 'My numbers' },
            { key: 'available', label: 'Rent a number' },
          ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Numbers</h1>
          <p className="text-sm text-muted-foreground">
            Premium DIDs · inbound P2P/A2P traffic · 7-day rule: no inbound for 7 days and the number is un-sourced upstream.
          </p>
        </div>
        <form className="flex gap-2" action="/panel/numbers">
          <input type="hidden" name="tab" value={tab} />
          <Input name="q" defaultValue={String(sp.q || '')} placeholder="Search number…" className="w-44" />
          <Button variant="outline" type="submit">Search</Button>
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

      {isAdmin && tab === 'all' && (
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
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 7} className="px-4 py-8 text-center text-muted-foreground">
                      No numbers here yet. {session.role === 'USER' && tab === 'mine' && 'Rent one from the pool tab.'}
                    </td>
                  </tr>
                )}
                {rows.map((d) => {
                  const t = trafficState(d.lastTrafficAt, d.assignedAt)
                  const ownerMargin = d.assignedUser ? d.assignedUser.marginPercent : viewerMargin
                  const userRate = d.trueRate * (1 - ownerMargin / 100)
                  return (
                    <tr key={d.id} className="border-b last:border-0 align-middle">
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
                        <Badge
                          variant={t.level === 'OK' ? 'secondary' : t.level === 'WARN' ? 'outline' : 'destructive'}
                          className={t.level === 'WARN' ? 'border-amber-500 text-amber-600' : ''}
                        >
                          {t.level === 'IDLE' && d.status === 'AVAILABLE' ? '—' : t.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {d.status === 'AVAILABLE' && session.role === 'USER' && selfService && (
                            <form action={rentNumber as unknown as (formData: FormData) => void}>
                              <input type="hidden" name="id" value={d.id} />
                              <Button size="sm" variant="outline">
                                Rent <ArrowUpRight className="size-3.5" />
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
