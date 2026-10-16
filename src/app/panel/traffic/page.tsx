import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteMessages } from './actions'
import { TrafficTable } from './traffic-table'
import type { LiveMessage } from './types'
import { Download } from 'lucide-react'


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

  // serialize for the (client) table; admin-only fields are included for admins only
  const initialRows: LiveMessage[] = rows.map((m) => ({
    id: m.id,
    receivedAt: m.receivedAt.toISOString(),
    numberFrom: m.numberFrom,
    numberTo: m.numberTo,
    destination: m.did?.destination ?? null,
    class: m.class,
    segments: m.segments,
    channel: m.channel,
    simulated: m.simulated,
    carriedBy: m.carriedBy,
    upstreamId: m.upstreamId ? m.upstreamId.slice(0, 10) : null,
    text: m.text,
    userName: isAdmin ? (m.user?.name ?? null) : null,
    userEarning: m.userEarning,
    ...(isAdmin ? { trueCost: m.trueCost, marginKept: m.marginKept, billingStatus: m.billingStatus } : {}),
  }))

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
        <TrafficTable
          initialRows={initialRows}
          isAdmin={isAdmin}
          currency={currency}
          q={String(sp.q || '')}
          cls={cls}
          days={days}
        />
      </form>
    </div>
  )
}
