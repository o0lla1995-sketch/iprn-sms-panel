import { requireSession } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { gatewayStatus } from '@/lib/smpp/gateway'
import { PanelShell } from '@/components/panel/shell'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const settings = await getSettings()
  const gw = session.role === 'ADMIN' ? gatewayStatus() : null

  return (
    <PanelShell
      session={session}
      siteName={settings.site_name || 'IPRN SMS Traffic Panel'}
      currency={settings.currency || 'USD'}
      gateway={gw ? { port: gw.port, upstreamConnected: gw.upstreamConnected, userBinds: gw.userBindCount } : null}
    >
      {children}
    </PanelShell>
  )
}
