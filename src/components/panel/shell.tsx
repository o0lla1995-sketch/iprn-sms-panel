'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Hash, MessageSquareText, Tag, Wallet, Banknote,
  Users, Settings, ScrollText, BookOpen, Menu, LogOut, Radio,
} from 'lucide-react'
import type { SessionPayload } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface GatewayInfo {
  port: number
  upstreamConnected: boolean
  userBinds: number
}

const NAV: {
  href: string
  label: string
  icon: React.ElementType
  roles: Array<SessionPayload['role']>
}[] = [
  { href: '/panel/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'AGENT', 'USER'] },
  { href: '/panel/numbers', label: 'Numbers', icon: Hash, roles: ['ADMIN', 'AGENT', 'USER'] },
  { href: '/panel/traffic', label: 'Traffic', icon: MessageSquareText, roles: ['ADMIN', 'AGENT', 'USER'] },
  { href: '/panel/rates', label: 'Rates', icon: Tag, roles: ['ADMIN', 'AGENT', 'USER'] },
  { href: '/panel/wallet', label: 'Wallet', icon: Wallet, roles: ['ADMIN', 'AGENT', 'USER'] },
  { href: '/panel/payouts', label: 'Payouts', icon: Banknote, roles: ['ADMIN', 'AGENT', 'USER'] },
  { href: '/panel/users', label: 'Users', icon: Users, roles: ['ADMIN', 'AGENT'] },
  { href: '/panel/settings', label: 'Settings', icon: Settings, roles: ['ADMIN', 'AGENT', 'USER'] },
  { href: '/panel/audit', label: 'Audit Log', icon: ScrollText, roles: ['ADMIN'] },
  { href: '/panel/guide', label: 'Setup Guide', icon: BookOpen, roles: ['ADMIN'] },
]

function NavLinks({ role, onNavigate }: { role: SessionPayload['role']; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {NAV.filter((n) => n.roles.includes(role)).map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + '/')
        const Icon = n.icon
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors min-h-[44px]',
              active
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Brand({ siteName, role }: { siteName: string; role: SessionPayload['role'] }) {
  return (
    <Link href="/panel/dashboard" className="flex items-center gap-3 px-2 py-1">
      <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">IP</div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">{siteName}</p>
        <p className="text-xs text-muted-foreground">{role.toLowerCase()} console</p>
      </div>
    </Link>
  )
}

export function PanelShell({
  session,
  siteName,
  currency,
  gateway,
  children,
}: {
  session: SessionPayload
  siteName: string
  currency: string
  gateway: GatewayInfo | null
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const roleBadge =
    session.role === 'ADMIN'
      ? <Badge className="bg-emerald-600 text-white border-emerald-600">ADMIN</Badge>
      : session.role === 'AGENT'
        ? <Badge variant="secondary">AGENT</Badge>
        : <Badge variant="outline">USER</Badge>

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          {/* mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="space-y-4">
                <Brand siteName={siteName} role={session.role} />
                <NavLinks role={session.role} onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="hidden md:block">
            <Brand siteName={siteName} role={session.role} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {gateway && (
              <span className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground" title="Upstream SMPP connector">
                <Radio className={cn('size-3.5', gateway.upstreamConnected ? 'text-emerald-500' : 'text-muted-foreground/50')} aria-hidden />
                SMPP :{gateway.port} · {gateway.upstreamConnected ? 'platform linked' : 'awaiting platform'}
                {gateway.userBinds > 0 && ` · ${gateway.userBinds} user bind(s)`}
              </span>
            )}
            {roleBadge}
            <span className="hidden sm:inline text-sm text-muted-foreground">{session.name}</span>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1400px] mx-auto flex gap-6 px-4 py-6">
        <aside className="hidden md:block w-56 shrink-0" aria-label="Sidebar">
          <div className="sticky top-20">
            <NavLinks role={session.role} />
            <div className="mt-6 rounded-lg border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">{session.email}</p>
              <p>Session currency: {currency}</p>
            </div>
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <footer className="mt-auto border-t">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{siteName}</span>
          <span aria-hidden>·</span>
          <span>P2P & A2P premium traffic console</span>
          <span aria-hidden>·</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
