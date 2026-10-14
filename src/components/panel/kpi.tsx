import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  icon?: LucideIcon
  tone?: 'default' | 'money' | 'warn' | 'danger'
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p
              className={cn(
                'text-xl font-semibold tabular-nums mt-1',
                tone === 'money' && 'text-emerald-600 dark:text-emerald-400',
                tone === 'warn' && 'text-amber-600 dark:text-amber-400',
                tone === 'danger' && 'text-destructive'
              )}
            >
              {value}
            </p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          {Icon && (
            <div className="rounded-lg bg-muted p-2 shrink-0">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
