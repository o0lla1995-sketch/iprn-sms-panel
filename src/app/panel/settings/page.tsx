import { requireSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { gatewayStatus } from '@/lib/smpp/gateway'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ActionForm } from '@/components/panel/action-form'
import { saveUpstream, rotateMoSecret, connectMoWebhook, testUpstream, saveSystem, resetDemoData, saveMyChannel, regenMyApiKey, issueMySmpp } from './actions'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const TABS_ADMIN = [
  { key: 'upstream', label: 'Upstream platform' },
  { key: 'system', label: 'System' },
  { key: 'channel', label: 'My channel' },
]

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const sp = await searchParams
  const isAdmin = session.role === 'ADMIN'
  const tab = isAdmin ? String(sp.tab || 'upstream') : 'channel'
  const settings = await getSettings()
  const me = await db.user.findUnique({ where: { id: session.uid } })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? 'Upstream integration, system economics and your own channel.' : 'Your receiving channels, payout schedule and API access.'}
        </p>
      </div>

      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          {TABS_ADMIN.map((t) => (
            <Link
              key={t.key}
              href={`/panel/settings?tab=${t.key}`}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm inline-flex items-center min-h-[36px]',
                tab === t.key ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {isAdmin && tab === 'upstream' && <UpstreamTab settings={settings} />}
      {isAdmin && tab === 'system' && <SystemTab settings={settings} />}
      <ChannelTab me={me} />
    </div>
  )
}

function UpstreamTab({ settings }: { settings: Record<string, string> }) {
  const gw = gatewayStatus()
  const host = settings.public_url ? settings.public_url.replace(/^https?:\/\//, '') : 'set-your-public-url'
  const moUrl = settings.public_url ? `${settings.public_url}/api/upstream/mo/${settings.mo_webhook_secret}` : '— set public URL first —'
  const hasDemo = settings.public_url === ''

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Platform connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm action={saveUpstream} submitLabel="Save upstream settings" size="default">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Platform base URL</Label>
                <Input name="upstream_base_url" defaultValue={settings.upstream_base_url} placeholder="https://sms.carefulsupport.com" />
              </div>
              <div className="space-y-1.5">
                <Label>x-api-key (from the platform&apos;s HTTP API page)</Label>
                <Input name="upstream_api_key" type="password" defaultValue={settings.upstream_api_key} placeholder="vendor_…" />
              </div>
              <div className="space-y-1.5">
                <Label>Panel public URL (no trailing slash)</Label>
                <Input name="public_url" defaultValue={settings.public_url} placeholder="https://panel.example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Auto-DLR receipts (24h rule protection)</Label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="auto_dlr" defaultChecked={settings.auto_dlr !== 'false'} className="size-4" />
                  Send DELIVRD receipts automatically
                </label>
              </div>
              <div className="space-y-1.5">
                <Label>Connector system_id (for the platform&apos;s form)</Label>
                <Input name="upstream_smpp_system_id" defaultValue={settings.upstream_smpp_system_id} />
              </div>
              <div className="space-y-1.5">
                <Label>Connector password</Label>
                <Input name="upstream_smpp_password" type="password" placeholder="leave blank to keep current" />
              </div>
            </div>
          </ActionForm>

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <ActionForm action={testUpstream} submitLabel="Test connection" variant="outline" />
            <ActionForm action={rotateMoSecret} submitLabel="Rotate webhook secret" variant="outline" />
            <ActionForm action={connectMoWebhook} submitLabel="Enable vendor-copy webhook" variant="outline">
              <input type="hidden" name="mode" value="on" />
            </ActionForm>
            <ActionForm action={connectMoWebhook} submitLabel="Disable webhook" variant="ghost">
              <input type="hidden" name="mode" value="off" />
            </ActionForm>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Supplier connector cheat-sheet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Enter these on the platform under <strong>Outbound Connectors → Add connector</strong>. The platform binds from{' '}
            <span className="font-mono text-xs">35.224.28.251</span> — allowlist it on any firewall in front of this panel.
          </p>
          <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs space-y-1">
            <p>Adapter&nbsp;&nbsp;&nbsp;: generic-smpp34</p>
            <p>Host&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {host}</p>
            <p>Port&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {settings.smpp_port || '2775'} <span className="text-muted-foreground">(SMPP gateway status: {gw.started ? `listening :${gw.port}` : 'not started'})</span></p>
            <p>system_id : {settings.upstream_smpp_system_id}</p>
            <p>password&nbsp;: <span className="text-muted-foreground">(saved — re-enter to change)</span></p>
            <p>MO mode&nbsp;: SAME_BIND</p>
            <p>Profile&nbsp;&nbsp;: Any profile</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Vendor-copy MO webhook URL (also configure via the button above):{' '}
            <span className="font-mono break-all">{moUrl}</span>
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">DLR within 24h or the message settles 0.0000 — auto-DLR keeps you safe</Badge>
            <Badge variant="outline">7 days without inbound un-sources a number</Badge>
            <Badge variant="outline">Platform egress IP 35.224.28.251</Badge>
            {hasDemo && <Badge variant="destructive">public URL not set</Badge>}
          </div>
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  )
}

function SystemTab({ settings }: { settings: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Economics &amp; identity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveSystem} submitLabel="Save system settings" size="default">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Site name</Label>
                <Input name="site_name" defaultValue={settings.site_name} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input name="currency" defaultValue={settings.currency || 'USD'} maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Default margin % (hidden from users)</Label>
                <Input name="default_margin" type="number" min="0" max="90" defaultValue={settings.default_margin} />
              </div>
              <div className="space-y-1.5">
                <Label>Minimum payout</Label>
                <Input name="min_payout" type="number" min="1" defaultValue={settings.min_payout} />
              </div>
              <div className="space-y-1.5">
                <Label>Weekly factoring % (fee on weekly payouts)</Label>
                <Input name="weekly_factoring_percent" type="number" min="0" max="90" defaultValue={settings.weekly_factoring_percent} />
              </div>
              <div className="space-y-1.5">
                <Label>Self-service number renting</Label>
                <label className="flex items-center gap-2 text-sm min-h-9">
                  <input type="checkbox" name="self_service_numbers" defaultChecked={settings.self_service_numbers !== 'false'} className="size-4" />
                  Users can rent available numbers themselves
                </label>
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <DangerZone />
    </div>
  )
}

function DangerZone() {
  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={resetDemoData} submitLabel="Clear demo data" variant="destructive">
          <p className="text-xs text-muted-foreground">
            Removes demo users, demo numbers, their traffic and ledger entries. Admin account and real data are untouched.
          </p>
        </ActionForm>
      </CardContent>
    </Card>
  )
}

function ChannelTab({ me }: { me: { webhookUrl: string | null; webhookSecret: string | null; payoutSchedule: string; apiKey: string; smppSystemId: string | null } | null }) {
  if (!me) return null
  const curl = `curl -H "x-api-key: ${me.apiKey.slice(0, 12)}…" ${'/api/v1/messages?limit=5'}`
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My receiving channels</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveMyChannel} submitLabel="Save channel settings" size="default">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>HTTP webhook URL (we POST each of your messages here)</Label>
                <Input name="webhookUrl" defaultValue={me.webhookUrl ?? ''} placeholder="https://your-system.example/hook" />
              </div>
              <div className="space-y-1.5">
                <Label>Webhook shared secret (sent as x-webhook-secret)</Label>
                <Input name="webhookSecret" defaultValue={me.webhookSecret ?? ''} placeholder="choose a secret" />
              </div>
              <div className="space-y-1.5">
                <Label>Payout schedule</Label>
                <Select name="schedule" defaultValue={me.payoutSchedule}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly — full rate</SelectItem>
                    <SelectItem value="WEEKLY">Weekly — factoring fee applies</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ActionForm>
          <p className="text-xs text-muted-foreground mt-3">
            POSTed payload: <code className="font-mono">{'{ id, to, from, text, segments, class, destination, your_earning, received_at }'}</code>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">SMPP bind (live push)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Bind into this panel as <strong>receiver</strong> or <strong>transceiver</strong> — your numbers&apos; inbound traffic is
              pushed to you as deliver_sm. Current bind: {me.smppSystemId ? <span className="font-mono">{me.smppSystemId}</span> : 'not issued'}.
            </p>
            <ActionForm action={issueMySmpp} submitLabel={me.smppSystemId ? 'Re-issue bind credentials' : 'Issue bind credentials'} variant="outline" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">REST API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Key: <span className="font-mono">{me.apiKey.slice(0, 12)}…</span> — use it as <code className="font-mono">x-api-key</code> on
              {' '}<span className="font-mono">/api/v1/me · /numbers · /messages · /rates · /balance</span> and POST <span className="font-mono">/api/v1/payouts</span>.
            </p>
            <pre className="rounded-md border bg-muted/50 p-2 text-[10px] overflow-x-auto">{curl}</pre>
            <ActionForm action={regenMyApiKey} submitLabel="Regenerate API key" variant="outline" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
