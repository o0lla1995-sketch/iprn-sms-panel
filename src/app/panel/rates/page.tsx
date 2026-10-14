import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { fmtRate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveRateGroup, deleteRateGroup, importRateGroups } from './actions'
import { Lock } from 'lucide-react'


export const dynamic = 'force-dynamic'

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const sp = await searchParams
  const q = String(sp.q || '').toLowerCase()
  const settings = await getSettings()
  const isAdmin = session.role === 'ADMIN'

  if (!isAdmin) {
    // ─────────── USER / AGENT: derived rate card only ───────────
    const me = await db.user.findUnique({ where: { id: session.uid } })
    const margin = me?.marginPercent ?? 30
    const groups = await db.rateGroup.findMany({
      where: q ? { destination: { contains: q } } : {},
      orderBy: [{ destination: 'asc' }],
    })
    const myNumbers = await db.did.findMany({ where: { assignedUserId: session.uid }, take: 100 })
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My rates</h1>
          <p className="text-sm text-muted-foreground">
            What you earn per inbound message, by destination. Payout schedule:{' '}
            {me?.payoutSchedule === 'WEEKLY' ? 'weekly (factoring fee applies)' : 'monthly (full rate)'}.
          </p>
        </div>
        <form action="/panel/rates" className="flex gap-2">
          <Input name="q" defaultValue={String(sp.q || '')} placeholder="Search destination…" className="w-56" />
          <Button variant="outline" type="submit">Search</Button>
        </form>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rate card — {groups.length} destination group(s)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 font-medium text-right">Your rate / message</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">{g.destination}</td>
                      <td className="px-4 py-2.5"><Badge variant="outline">{g.class}</Badge></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        ${fmtRate(g.trueRate * (1 - margin / 100))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        {myNumbers.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">My numbers — per-message earning</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Number</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium text-right">Your rate / message</th>
                  </tr>
                </thead>
                <tbody>
                  {myNumbers.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">+{d.number}</td>
                      <td className="px-4 py-2.5">{d.destination}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        ${fmtRate(d.trueRate * (1 - margin / 100))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // ─────────── ADMIN: true rates + margin preview ───────────
  const defaultMargin = Number(settings.default_margin || 30)
  const groups = await db.rateGroup.findMany({
    where: q ? { destination: { contains: q } } : {},
    orderBy: [{ destination: 'asc' }],
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rates</h1>
        <p className="text-sm text-muted-foreground">
          True settlement rates (upstream vendor rates) — admins only. User rates are derived by each user&apos;s margin and never exposed.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add / update a group</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveRateGroup as unknown as (formData: FormData) => void} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="destination">Destination</Label>
                  <Input id="destination" name="destination" required placeholder="e.g. Algeria Azure" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trueRate">True rate (USD)</Label>
                  <Input id="trueRate" name="trueRate" type="number" step="0.0001" min="0" required placeholder="0.0120" />
                </div>
                <div className="space-y-1.5">
                  <Label>Class</Label>
                  <Select name="class" defaultValue="BOTH">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOTH">BOTH</SelectItem>
                      <SelectItem value="P2P">P2P</SelectItem>
                      <SelectItem value="A2P">A2P</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="numbersCount">Numbers in group</Label>
                  <Input id="numbersCount" name="numbersCount" type="number" min="0" placeholder="9387" />
                </div>
              </div>
              <Button type="submit">Save group</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Import from upstream Settlement Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={importRateGroups as unknown as (formData: FormData) => void} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="list">Paste rows — destination, rate, class, count</Label>
                <textarea
                  id="list"
                  name="list"
                  required
                  rows={5}
                  className="font-mono text-xs flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2"
                  placeholder={'Algeria\tPRN\tBOTH\t0.0150\t4000\nA2P UK\tPRN\tA2P\t0.0085\t1576'}
                />
              </div>
              <Button type="submit" variant="outline">Import</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <form action="/panel/rates" className="flex gap-2">
        <Input name="q" defaultValue={String(sp.q || '')} placeholder="Search destination…" className="w-56" />
        <Button variant="outline" type="submit">Search</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium text-right">True rate</th>
                  <th className="px-4 py-3 font-medium text-right">Numbers</th>
                  <th className="px-4 py-3 font-medium text-right">Derived @ {defaultMargin}% margin</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">{g.destination}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline">{g.class}</Badge></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{g.model}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">${fmtRate(g.trueRate)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">{g.numbersCount || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      ${fmtRate(g.trueRate * (1 - defaultMargin / 100))}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <details className="inline">
                          <summary className="cursor-pointer text-xs text-muted-foreground underline">edit</summary>
                          <form action={saveRateGroup as unknown as (formData: FormData) => void} className="mt-2 w-64 rounded-lg border bg-card p-3 shadow-lg space-y-2">
                            <input type="hidden" name="id" value={g.id} />
                            <Label className="text-xs">Destination</Label>
                            <Input name="destination" defaultValue={g.destination} className="h-8 text-xs" />
                            <Label className="text-xs">True rate</Label>
                            <Input name="trueRate" type="number" step="0.0001" defaultValue={g.trueRate} className="h-8 text-xs" />
                            <Label className="text-xs">Class</Label>
                            <Select name="class" defaultValue={g.class}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="BOTH">BOTH</SelectItem>
                                <SelectItem value="P2P">P2P</SelectItem>
                                <SelectItem value="A2P">A2P</SelectItem>
                              </SelectContent>
                            </Select>
                            <Label className="text-xs">Numbers in group</Label>
                            <Input name="numbersCount" type="number" defaultValue={g.numbersCount} className="h-8 text-xs" />
                            <Button size="sm" type="submit" className="w-full">Save</Button>
                          </form>
                        </details>
                        <form action={deleteRateGroup as unknown as (formData: FormData) => void}>
                          <input type="hidden" name="id" value={g.id} />
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">Delete</Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Lock className="size-3.5" aria-hidden />
        True rates and margin fields are stripped from every user-facing page and API response.
      </p>
    </div>
  )
}
