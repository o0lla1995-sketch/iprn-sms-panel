import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import LoginForm from './login-form'

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect('/panel/dashboard')

  const settings = await getSettings()
  const siteName = settings.site_name || 'IPRN SMS Traffic Panel'
  const demo = await db.user.findFirst({ where: { email: 'user1@demo.local' } })

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto size-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center text-2xl font-bold shadow-lg">
              IP
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{siteName}</h1>
            <p className="text-sm text-muted-foreground">
              Premium-rate SMS traffic · numbers · accounting · payouts
            </p>
          </div>
          <LoginForm />
          {demo && (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Demo data loaded</p>
              <p>admin: <code className="font-mono">admin@iprn.local / Admin@12345</code></p>
              <p>agent: <code className="font-mono">agent1@demo.local / demo1234</code> · user: <code className="font-mono">user1@demo.local / demo1234</code></p>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Access is restricted to authorised accounts. All activity is audited.
          </p>
        </div>
      </main>
      <footer className="border-t py-3 text-center text-xs text-muted-foreground">
        {siteName} · {new Date().getFullYear()}
      </footer>
    </div>
  )
}
