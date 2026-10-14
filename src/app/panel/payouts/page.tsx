import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { fmtMoney, fmtDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requestPayout, decidePayout } from './actions'


export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, string> = {
  PENDING: 'border-amber-500 text-amber-600',
  APPROVED: 'border-emerald-500 text-emerald-600',
  PAID: 'bg-emerald-600 text-white border-emerald-600',
  REJECTED: 'destructive',
}

export default async function PayoutsPage() {
  const session = await requireSession()
  const settings = await getSettings()
  const currency = settings.currency || 'USD'
  const isAdmin = session.role === 'ADMIN'

  if (isAdmin) {
    const requests = await db.payoutRequest.findMany({
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
          <p className="text-sm text-muted-foreground">
            All payout requests. Approve → then mark paid once the transfer is done. Rejecting returns held funds.
          </p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{requests.length} request(s)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Requested</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Schedule</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium text-right">Fee</th>
                    <th className="px-4 py-3 font-medium text-right">Net</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No payout requests yet.</td></tr>
                  )}
                  {requests.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                        {fmtDateTime(p.createdAt).slice(0, 17)}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.user.name}
                        <span className="text-xs text-muted-foreground"> · {p.user.role.toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{p.schedule}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(p.amount, currency)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {p.feePercent}% = {fmtMoney(p.fee, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        {fmtMoney(p.net, currency)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={STATUS_TONE[p.status] || ''}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-56 truncate">{p.method ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {p.status === 'PENDING' || p.status === 'APPROVED' ? (
                          <div className="flex flex-wrap gap-1.5">
                            {p.status === 'PENDING' && (
                              <form action={decidePayout as unknown as (formData: FormData) => void}>
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="decision" value="approve" />
                                <Button size="sm" variant="outline">Approve</Button>
                              </form>
                            )}
                            <form action={decidePayout as unknown as (formData: FormData) => void}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="decision" value="paid" />
                              <Button size="sm">Mark paid</Button>
                            </form>
                            <form action={decidePayout as unknown as (formData: FormData) => void}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="decision" value="reject" />
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">Reject</Button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{fmtDateTime(p.processedAt).slice(0, 17)}</span>
                        )}
                      </td>
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

  // ─────────── USER / AGENT ───────────
  const me = await db.user.findUnique({ where: { id: session.uid } })
  const requests = await db.payoutRequest.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const minPayout = Number(settings.min_payout || 200)
  const weeklyFee = Number(settings.weekly_factoring_percent || 30)
  const feePercent = me?.payoutSchedule === 'WEEKLY' ? weeklyFee : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
        <p className="text-sm text-muted-foreground">
          Request a withdrawal. Funds are held immediately; you get paid after admin approval.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New payout request</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={requestPayout as unknown as (formData: FormData) => void} className="space-y-3 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount (available: {fmtMoney(me?.walletBalance ?? 0, currency)})</Label>
                <Input id="amount" name="amount" type="number" step="0.01" min={minPayout} required placeholder={String(minPayout)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="method">Payment details (bank / IBAN / wallet)</Label>
                <textarea
                  id="method"
                  name="method"
                  rows={3}
                  defaultValue={me?.payoutMethod ?? ''}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  placeholder="Bank name, IBAN, SWIFT — or wallet address"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum {fmtMoney(minPayout, currency)} · your schedule is {me?.payoutSchedule} · factoring fee {feePercent}% →
                you receive amount − fee.
              </p>
              <Button type="submit">Request payout</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rules</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>Weekly factoring settles faster but deducts {weeklyFee}% from each payout.</p>
            <p>Monthly schedule pays the full rate per closed billing period.</p>
            <p>Only one pending request at a time.</p>
            <p>Rejected requests return held funds to your balance.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">My payout history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">Fee</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No requests yet.</td></tr>
              )}
              {requests.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtDateTime(p.createdAt).slice(0, 17)}</td>
                  <td className="px-4 py-2.5 text-xs">{p.schedule}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(p.amount, currency)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">{fmtMoney(p.fee, currency)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">{fmtMoney(p.net, currency)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={STATUS_TONE[p.status] || ''}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-56 truncate">{p.adminNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
