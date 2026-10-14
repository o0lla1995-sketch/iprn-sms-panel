import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { fmtMoney, fmtDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { deleteMessages } from './actions'
import { Download, Trash2 } from 'lucide-react'


export const dynamic = 'force-dynamic'

export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const sp = await searchParams
  const q = String(sp.q || '').toLowerCase()
  const cls = String(sp.class || '')
  const days = Number(sp.days || 7) || 7
  const isAdmin = session.role === 'ADMIN'

  const where: Record<string, unknown> = { deletedAt: null }
  if (days > 0 && days < 3650) where.receivedAt = { gte: new Date(Date.now() - days * 86400000) }
  if (cls === 'P2P' || cls === 'A2P') where.class = cls
  if (q) where.OR = [{ numberFrom: { contains: q } }, { numberTo: { contains: q } }]

  if (session.role === 'USER') where.userId = session.uid
  if (session.role === 'AGENT') {
    const kids = await db.user.findMany({ where: { parentId: session.uid }, select: { id: true } })
    where.userId = { in: [...kids.map((k) => k.id), session.uid] }
  }

  const rows = await db.message.findMany({
    where,
    include: { did: { select: { destination: true } }, user: { select: { email: true, name: true } } },
    orderBy: { receivedAt: 'desc' },
    take: 200,
  })
  const currency = 'USD'

  const qs = new URLSearchParams({ q: String(sp.q || ''), class: cls, days: String(days) })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Traffic</h1>
          <p className="text-sm text-muted-foreground">
            Inbound P2P / A2P messages on premium numbers. Deleting hides a message here — earnings and audits remain.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/panel/traffic/export?${qs.toString()}`}>
            <Download className="size-4" /> Export CSV
          </a>
        </Button>
      </div>

      <form action="/panel/traffic" className="flex flex-wrap gap-2 items-end">
        <div>
          <label htmlFor="q" className="sr-only">Search</label>
          <Input id="q" name="q" defaultValue={String(sp.q || '')} placeholder="Search from / to…" className="w-44" />
        </div>
        <div>
          <label htmlFor="class" className="sr-only">Class</label>
          <select
            id="class"
            name="class"
            defaultValue={cls}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All classes</option>
            <option value="P2P">P2P</option>
            <option value="A2P">A2P</option>
          </select>
        </div>
        <div>
          <label htmlFor="days" className="sr-only">Period</label>
          <select
            id="days"
            name="days"
            defaultValue={String(days)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="1">Last 24h</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="3650">All time</option>
          </select>
        </div>
        <Button variant="outline" type="submit">Apply</Button>
      </form>

      <form action={deleteMessages as unknown as (formData: FormData) => void}>
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm text-muted-foreground">{rows.length} message(s)</p>
              <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="size-4" /> Delete selected
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="w-8 px-4 py-3 font-medium"><span className="sr-only">Select</span></th>
                    <th className="px-2 py-3 font-medium">When</th>
                    <th className="px-2 py-3 font-medium">From</th>
                    <th className="px-2 py-3 font-medium">To</th>
                    <th className="px-2 py-3 font-medium">Class</th>
                    <th className="px-2 py-3 font-medium">Seg</th>
                    <th className="px-2 py-3 font-medium">Channel</th>
                    {isAdmin ? (
                      <>
                        <th className="px-2 py-3 font-medium">User</th>
                        <th className="px-2 py-3 font-medium">User earns</th>
                        <th className="px-2 py-3 font-medium">Margin</th>
                        <th className="px-2 py-3 font-medium">True</th>
                        <th className="px-2 py-3 font-medium">Billing</th>
                      </>
                    ) : (
                      <th className="px-2 py-3 font-medium">Your earning</th>
                    )}
                    <th className="px-2 py-3 font-medium">Msg</th>
                    <th className="px-2 py-3 font-medium"><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 13 : 10} className="px-4 py-10 text-center text-muted-foreground">
                        No messages for these filters.
                      </td>
                    </tr>
                  )}
                  {rows.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 align-middle hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <input type="checkbox" name="ids" value={m.id} aria-label={`Select ${m.id}`} className="size-4" />
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                        {fmtDateTime(m.receivedAt).slice(0, 17)}
                      </td>
                      <td className="px-2 py-2.5 text-xs">{m.numberFrom}</td>
                      <td className="px-2 py-2.5 text-xs">
                        <span className="font-mono">+{m.numberTo}</span>
                        <span className="text-muted-foreground"> · {m.did?.destination ?? 'unmatched'}</span>
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge variant={m.class === 'A2P' ? 'secondary' : 'outline'}>{m.class}</Badge>
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-xs">{m.segments}</td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">
                        {m.channel.toLowerCase()}
                        {m.simulated && <span className="ml-1 text-amber-600 dark:text-amber-400">· sim</span>}
                      </td>
                      {isAdmin ? (
                        <>
                          <td className="px-2 py-2.5 text-xs">{m.user?.name ?? <span className="text-muted-foreground">unassigned</span>}</td>
                          <td className="px-2 py-2.5 tabular-nums text-xs text-emerald-600 dark:text-emerald-400">
                            {m.simulated ? '—' : fmtMoney(m.userEarning, currency)}
                          </td>
                          <td className="px-2 py-2.5 tabular-nums text-xs text-amber-600 dark:text-amber-400">
                            {m.simulated ? '—' : fmtMoney(m.marginKept, currency)}
                          </td>
                          <td className="px-2 py-2.5 tabular-nums text-xs">{m.simulated ? '—' : fmtMoney(m.trueCost, currency)}</td>
                          <td className="px-2 py-2.5">
                            <Badge
                              variant={m.billingStatus === 'BILLED' ? 'secondary' : m.billingStatus === 'UNPRICED' ? 'destructive' : 'outline'}
                              className="text-[10px]"
                            >
                              {m.billingStatus}
                            </Badge>
                          </td>
                        </>
                      ) : (
                        <td className={cn('px-2 py-2.5 tabular-nums text-xs text-emerald-600 dark:text-emerald-400 font-medium')}>
                          {m.simulated ? 'sim test' : fmtMoney(m.userEarning, currency)}
                        </td>
                      )}
                      <td className="px-2 py-2.5">
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground underline">view</summary>
                          <p className="mt-1 max-w-96 text-xs bg-muted rounded p-2">{m.text}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            carried by {m.carriedBy.toLowerCase()} · {m.upstreamId ? `id ${m.upstreamId.slice(0, 10)}…` : 'no upstream id'}
                          </p>
                        </details>
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="submit"
                          name="id"
                          value={m.id}
                          formAction={deleteMessages as unknown as (formData: FormData) => void}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Delete message"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
