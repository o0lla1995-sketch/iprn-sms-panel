import { requireRole } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { gatewayStatus } from '@/lib/smpp/gateway'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function GuidePage() {
  await requireRole(['ADMIN'])
  const settings = await getSettings()
  const gw = gatewayStatus()
  const moUrl = settings.public_url ? `${settings.public_url}/api/upstream/mo/${settings.mo_webhook_secret}` : '— set the panel public URL in Settings —'

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: '1 · Put the panel on a public URL',
      body: (
        <>
          <p>Deploy this panel (Coolify/Docker) and point a DNS record at it, then set <strong>Panel public URL</strong> in Settings → Upstream. The SMPP port <span className="font-mono">{settings.smpp_port || '2775'}</span> must be open to the internet — the platform connects from <span className="font-mono">35.224.28.251</span>, so allowlist that IP on any firewall.</p>
          <p className="mt-1">Current gateway status: <Badge variant={gw.started ? 'secondary' : 'destructive'}>{gw.started ? `listening on :${gw.port}` : 'not started'}</Badge></p>
        </>
      ),
    },
    {
      title: '2 · Register the connector on the platform',
      body: (
        <>
          <p>On <strong>sms.carefulsupport.com → Outbound Connectors → Add connector</strong>, enter the cheat-sheet values from Settings → Upstream:</p>
          <div className="mt-2 rounded-lg border bg-muted/40 p-3 font-mono text-xs space-y-1">
            <p>Adapter: generic-smpp34</p>
            <p>Host: {settings.public_url ? settings.public_url.replace(/^https?:\/\//, '') : '&lt;panel-host&gt;'}</p>
            <p>Port: {settings.smpp_port || '2775'}</p>
            <p>system_id: {settings.upstream_smpp_system_id}</p>
            <p>password: (the connector password you saved)</p>
            <p>MO mode: SAME_BIND · Profile: Any profile</p>
          </div>
          <p className="mt-2">When it shows <em>Connected</em>, the platform can deliver traffic to this panel and billing starts flowing.</p>
        </>
      ),
    },
    {
      title: '3 · Enable the vendor-copy MO webhook (HTTP redundancy)',
      body: (
        <>
          <p>In Settings → Upstream press <strong>Enable vendor-copy webhook</strong>. It calls the platform API <span className="font-mono">PUT /v1/account/mo-webhook</span> with:</p>
          <pre className="mt-2 rounded-md border bg-muted/50 p-2 text-[11px] overflow-x-auto">{`{ "mo_url": "${moUrl}" }`}</pre>
          <p className="mt-2">Copies arrive with <span className="font-mono">role: "vendor_copy"</span>; simulated test traffic is flagged <span className="font-mono">simulated: true</span> and is zero-rated in accounting. Duplicates are de-duplicated automatically.</p>
        </>
      ),
    },
    {
      title: '4 · Allocate routes / source numbers upstream',
      body: (
        <>
          <p>On the platform: <strong>Settlement Rates → All numbers in the system → Allocate</strong> for the destinations you want to carry, and/or <strong>Numbers → Source</strong> for individual DIDs, and/or <strong>Access List → Allocate</strong> for busy app destinations (PayPal, TikTok, WhatsApp…). This is what creates <em>routes that send you traffic</em>.</p>
          <p className="mt-2">Then mirror those groups into this panel: <strong>Rates → Import</strong> (paste the settlement rows). True rates stay admin-only; user rates are derived minus each user&apos;s margin.</p>
        </>
      ),
    },
    {
      title: '5 · Onboard users and agents',
      body: (
        <>
          <p><strong>Users → Create</strong>: pick a margin % (default 30 — the hidden admin share, never shown to the user), an agent commission % for agents, and a payout schedule (weekly = factoring fee, monthly = full rate). Issue each user an API key and optional SMPP bind from the row tools.</p>
          <p className="mt-2">Users rent numbers from the pool (self-service can be disabled) and profit per inbound message at their derived rate. Agents earn a commission on their sub-users&apos; earnings, paid from the admin margin.</p>
        </>
      ),
    },
    {
      title: '6 · Operate by the platform rules',
      body: (
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>DLR:</strong> a carried message must get its receipt within 24 hours or it settles at 0.0000 — auto-DLR (on by default) protects every message.</li>
          <li><strong>7-day rule:</strong> a sourced number with no inbound for 7 days is un-sourced automatically; the platform warns 3 days ahead. The dashboard badges every number with its countdown.</li>
          <li><strong>Billing:</strong> traffic settles AP-side — minimum payout {settings.min_payout || '200'} USD, weekly factoring {settings.weekly_factoring_percent || 30}% less, or monthly at full rate. Mirror those choices per user; their payout fee follows their schedule.</li>
          <li><strong>Egress:</strong> all platform binds and HTTP pushes originate from 35.224.28.251.</li>
        </ul>
      ),
    },
    {
      title: '7 · Reconcile with the platform exports',
      body: (
        <>
          <p>Export <strong>Outbound Messages</strong> CSV from the platform (it shows the true vendor cost per message) and import it under Rates/Numbers to keep the panel aligned with upstream billing. Use Traffic → Export CSV for your own records.</p>
        </>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setup guide</h1>
        <p className="text-sm text-muted-foreground">
          From empty panel to live traffic — the exact sequence, matching the upstream wholesale platform&apos;s own model.
        </p>
      </div>
      {steps.map((s) => (
        <Card key={s.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground [&_strong]:text-foreground">
            {s.body}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
