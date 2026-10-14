import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { fmtMoney, fmtDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ActionForm } from '@/components/panel/action-form'
import { createUser, updateUser, toggleStatus, resetPassword, resetApiKey, issueSmpp, adjustWallet } from './actions'
import { Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  if (session.role === 'USER') {
    return <p className="text-sm text-muted-foreground">Not available for user accounts.</p>
  }
  const sp = await searchParams
  const q = String(sp.q || '').toLowerCase()
  const isAdmin = session.role === 'ADMIN'
  const settings = await getSettings()
  const defaultMargin = Number(settings.default_margin || 30)

  const where: Record<string, unknown> = {}
  if (session.role === 'AGENT') where.parentId = session.uid
  else where.role = { not: 'ADMIN' }
  if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q } }]
  else if (session.role === 'AGENT') where.role = { in: ['USER'] }

  let users = await db.user.findMany({ where, orderBy: { createdAt: 'desc' } })
  // Agents only ever see their own sub-users (belt & braces filter)
  if (session.role === 'AGENT') users = users.filter((u) => u.parentId === session.uid)

  const numberCounts = await db.did.groupBy({ by: ['assignedUserId'], where: { status: 'ASSIGNED' }, _count: true })
  const countFor = (id: string) => numberCounts.find((n) => n.assignedUserId === id)?._count ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? 'Panel accounts. The margin field is admin-only — users never see it or the true rates.'
            : 'Your sub-users. Contact the administrator for margin or billing changes.'}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Create a {isAdmin ? 'user or agent' : 'sub-user'}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createUser} submitLabel="Create account" size="default">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="user@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password (blank = generate)</Label>
                <Input id="password" name="password" placeholder="auto-generated" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                {isAdmin ? (
                  <Select name="role" defaultValue="USER">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">USER</SelectItem>
                      <SelectItem value="AGENT">AGENT</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value="USER" disabled />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Payout schedule</Label>
                <Select name="schedule" defaultValue="MONTHLY">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly (full rate)</SelectItem>
                    <SelectItem value="WEEKLY">Weekly (factoring fee)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label htmlFor="marginPercent">Margin % (admin-only)</Label>
                  <Input id="marginPercent" name="marginPercent" type="number" min="0" max="90" step="1" defaultValue={defaultMargin} />
                </div>
              )}
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label htmlFor="agentCommissionPercent">Agent commission %</Label>
                  <Input id="agentCommissionPercent" name="agentCommissionPercent" type="number" min="0" max="100" step="1" defaultValue={10} />
                </div>
              )}
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <form action="/panel/users" className="flex gap-2">
        <Input name="q" defaultValue={String(sp.q || '')} placeholder="Search name or email…" className="w-56" />
        <button type="submit" className="rounded-md border px-3 text-sm">Search</button>
      </form>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                  {isAdmin && <th className="px-4 py-3 font-medium">Margin</th>}
                  {isAdmin && <th className="px-4 py-3 font-medium">Commission</th>}
                  <th className="px-4 py-3 font-medium">Schedule</th>
                  <th className="px-4 py-3 font-medium text-right">Numbers</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium">Manage</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={isAdmin ? 10 : 8} className="px-4 py-10 text-center text-muted-foreground">No accounts yet.</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-[10px] text-muted-foreground">api key: {u.apiKey.slice(0, 10)}… · smpp: {u.smppSystemId ?? 'not issued'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'AGENT' ? 'secondary' : 'outline'}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.status === 'ACTIVE' ? 'outline' : 'destructive'} className={u.status === 'ACTIVE' ? 'border-emerald-500 text-emerald-600' : ''}>
                        {u.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtMoney(u.walletBalance)}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <span className="tabular-nums text-amber-600 dark:text-amber-400 font-medium">{u.marginPercent}%</span>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="size-3" aria-hidden /> hidden from user</p>
                      </td>
                    )}
                    {isAdmin && <td className="px-4 py-3 tabular-nums text-xs">{u.role === 'AGENT' ? `${u.agentCommissionPercent}%` : '—'}</td>}
                    <td className="px-4 py-3 text-xs">{u.payoutSchedule.toLowerCase()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{countFor(u.id)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {u.lastLoginAt ? fmtDateTime(u.lastLoginAt).slice(0, 17) : 'never'}
                    </td>
                    <td className="px-4 py-3">
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground underline">tools</summary>
                        <div className="mt-2 w-80 space-y-4 rounded-lg border bg-card p-3 shadow-lg">
                          {isAdmin && (
                            <>
                              <div className="space-y-1">
                                <p className="text-xs font-medium">Edit account</p>
                                <ActionForm action={updateUser} submitLabel="Save changes" variant="outline">
                                  <input type="hidden" name="id" value={u.id} />
                                  <div className="grid grid-cols-2 gap-2">
                                    <div><Label className="text-xs">Name</Label><Input name="name" defaultValue={u.name} className="h-8 text-xs" /></div>
                                    <div>
                                      <Label className="text-xs">Role</Label>
                                      <Select name="role" defaultValue={u.role}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="USER">USER</SelectItem><SelectItem value="AGENT">AGENT</SelectItem></SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label className="text-xs">Status</Label>
                                      <Select name="status" defaultValue={u.status}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="ACTIVE">ACTIVE</SelectItem><SelectItem value="SUSPENDED">SUSPENDED</SelectItem></SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label className="text-xs">Schedule</Label>
                                      <Select name="schedule" defaultValue={u.payoutSchedule}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="MONTHLY">MONTHLY</SelectItem><SelectItem value="WEEKLY">WEEKLY</SelectItem></SelectContent>
                                      </Select>
                                    </div>
                                    <div><Label className="text-xs">Margin %</Label><Input name="marginPercent" type="number" min="0" max="90" defaultValue={u.marginPercent} className="h-8 text-xs" /></div>
                                    <div><Label className="text-xs">Agent commission %</Label><Input name="agentCommissionPercent" type="number" min="0" max="100" defaultValue={u.agentCommissionPercent} className="h-8 text-xs" /></div>
                                  </div>
                                </ActionForm>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-medium">Adjust wallet</p>
                                <ActionForm action={adjustWallet} submitLabel="Apply" variant="outline">
                                  <input type="hidden" name="id" value={u.id} />
                                  <div className="grid grid-cols-2 gap-2">
                                    <div><Label className="text-xs">Amount (+/−)</Label><Input name="amount" type="number" step="0.01" required className="h-8 text-xs" placeholder="-25 or 50" /></div>
                                    <div><Label className="text-xs">Note</Label><Input name="note" className="h-8 text-xs" placeholder="correction / bonus" /></div>
                                  </div>
                                </ActionForm>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-medium">Status</p>
                                <ActionForm action={toggleStatus} submitLabel={u.status === 'ACTIVE' ? 'Suspend' : 'Re-activate'} variant="outline">
                                  <input type="hidden" name="id" value={u.id} />
                                </ActionForm>
                              </div>
                            </>
                          )}
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Credentials</p>
                            <div className="flex flex-wrap gap-2">
                              <ActionForm action={resetPassword} submitLabel="Reset password" variant="outline">
                                <input type="hidden" name="id" value={u.id} />
                              </ActionForm>
                              <ActionForm action={resetApiKey} submitLabel="New API key" variant="outline">
                                <input type="hidden" name="id" value={u.id} />
                              </ActionForm>
                              <ActionForm action={issueSmpp} submitLabel="Issue SMPP bind" variant="outline">
                                <input type="hidden" name="id" value={u.id} />
                              </ActionForm>
                            </div>
                          </div>
                        </div>
                      </details>
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
