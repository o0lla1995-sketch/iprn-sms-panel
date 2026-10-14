import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { fmtMoney, fmtDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Landmark, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

const TYPE_TONE: Record<string, string> = {
  EARNING: 'bg-emerald-600 text-white border-emerald-600',
  COMMISSION: 'bg-emerald-600 text-white border-emerald-600',
  PAYOUT: 'border-amber-500 text-amber-600',
  PAYOUT_REFUND: 'border-amber-500 text-amber-600',
  ADJUSTMENT: 'secondary',
}

export default async function WalletPage() {
  const session = await requireSession()
  const settings = await getSettings()
  const currency = settings.currency || 'USD'
  const me = await db.user.findUnique({ where: { id: session.uid } })
  const txs = await db.transaction.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const pending = await db.payoutRequest.findFirst({ where: { userId: session.uid, status: 'PENDING' } })
  const minPayout = Number(settings.min_payout || 200)
  const weeklyFee = Number(settings.weekly_factoring_percent || 30)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="text-sm text-muted-foreground">Balance, payout schedule and the full ledger of your account.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Available balance</p>
            <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
              {fmtMoney(me?.walletBalance ?? 0, currency)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {pending ? 'A payout request is pending — funds are held.' : 'Ready to request a payout (min ' + fmtMoney(minPayout, currency) + ').'}
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/panel/payouts"><Landmark className="size-4" /> Payouts</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payout schedule</p>
            <p className="text-lg font-semibold mt-1">
              {me?.payoutSchedule === 'WEEKLY' ? 'Weekly factoring' : 'Monthly standard'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {me?.payoutSchedule === 'WEEKLY'
                ? `Faster payouts, a ${weeklyFee}% factoring fee is deducted from each payout.`
                : 'Full rate, settled per closed monthly billing period.'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Minimum payout: {fmtMoney(minPayout, currency)}.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payment details</p>
            <p className="text-sm mt-1 break-words">{me?.payoutMethod || 'Not set — add it on the Payouts page.'}</p>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
              <TrendingUp className="size-3.5" aria-hidden />
              Earnings accrue per inbound message at your rates.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ledger — {txs.length} entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Balance after</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {txs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No ledger entries yet.</td>
                  </tr>
                )}
                {txs.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                      {fmtDateTime(t.createdAt).slice(0, 17)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={TYPE_TONE[t.type] ? 'default' : 'outline'} className={TYPE_TONE[t.type] || ''}>
                        {t.type}
                      </Badge>
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${t.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {t.amount >= 0 ? '+' : ''}{fmtMoney(t.amount, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(t.balanceAfter, currency)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-72 truncate">{t.note ?? '—'}</td>
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
