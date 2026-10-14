import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { fmtDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const q = String(sp.q || '').toLowerCase()

  const where: Record<string, unknown> = {}
  if (q) where.action = { contains: q.toUpperCase().replace(/\s+/g, '_') }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every privileged action — user changes, rates, payouts, settings, imports.</p>
      </div>
      <form action="/panel/audit" className="flex gap-2">
        <Input name="q" defaultValue={String(sp.q || '')} placeholder="Filter by action…" className="w-56" />
        <Button variant="outline" type="submit">Filter</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nothing recorded yet.</td></tr>
                )}
                {logs.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                      {fmtDateTime(l.createdAt).slice(0, 19)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{l.actorEmail ?? 'system'}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline">{l.action}</Badge></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.entity ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs max-w-96 break-words">{l.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
