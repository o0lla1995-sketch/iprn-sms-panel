import { AlertTriangle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { TrafficState } from '@/lib/format'

/**
 * Prominent 7-day no-traffic countdown badge (upstream auto-release rule).
 * OK → muted · WARN (≤5d) → amber · DANGER (≤3d left or exceeded) → red pulsing.
 * Used on every number list (numbers page tabs + dashboard).
 */
export function CountdownBadge({ state, inPool }: { state: TrafficState; inPool?: boolean }) {
  if (state.level === 'IDLE') {
    if (inPool) return <span className="text-xs text-muted-foreground">—</span>
    return (
      <Badge variant="outline" className="gap-1 text-xs whitespace-nowrap">
        <Clock className="size-3" aria-hidden />
        no traffic yet
      </Badge>
    )
  }

  if (state.level === 'OK') {
    return (
      <Badge variant="secondary" className="gap-1 text-xs tabular-nums whitespace-nowrap" title="7-day no-traffic rule: healthy">
        <Clock className="size-3" aria-hidden />
        {state.label}
      </Badge>
    )
  }

  if (state.level === 'WARN') {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-xs tabular-nums whitespace-nowrap border-amber-500 text-amber-600 dark:text-amber-400"
        title="7-day no-traffic rule: attention — get inbound traffic to this number"
      >
        <Clock className="size-3" aria-hidden />
        {state.label}
      </Badge>
    )
  }

  return (
    <Badge
      variant="destructive"
      className="gap-1 text-xs tabular-nums whitespace-nowrap font-semibold"
      title="7-day no-traffic rule: this number is about to be un-sourced upstream"
    >
      <AlertTriangle className="size-3 animate-pulse" aria-hidden />
      {state.label}
    </Badge>
  )
}
