'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { fmtMoney, fmtDateTime, timeAgo } from '@/lib/format'
import { deleteMessages } from './actions'
import type { LiveMessage } from './types'
import { Trash2 } from 'lucide-react'

interface PollResponse {
  ok: boolean
  serverTime: string
  rows: LiveMessage[]
}

const POLL_MS = 5000

/**
 * Traffic table with optional LIVE mode: a client toggle that auto-refreshes
 * every 5 seconds from /api/panel/traffic/live, highlights rows that arrived
 * since the last poll and shows a pulsing live indicator.
 * Filters / export / delete behaviour is unchanged (server-side).
 */
export function TrafficTable({
  initialRows,
  isAdmin,
  currency,
  q,
  cls,
  days,
}: {
  initialRows: LiveMessage[]
  isAdmin: boolean
  currency: string
  q: string
  cls: string
  days: number
}) {
  const [rows, setRows] = useState<LiveMessage[]>(initialRows)
  const [live, setLive] = useState(false)
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set())
  const [newCount, setNewCount] = useState(0)
  const [lastPolled, setLastPolled] = useState<string | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const watermark = useRef<string | null>(null)

  // stay in sync with server-side navigation (filter changes re-render the page)
  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  // reset the "new" counters whenever the filter set changes
  useEffect(() => {
    setNewCount(0)
    setHighlighted(new Set())
  }, [q, cls, days])

  const poll = useCallback(async (): Promise<number> => {
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (cls) qs.set('class', cls)
    qs.set('days', String(days))
    if (watermark.current) qs.set('since', watermark.current)
    const res = await fetch(`/api/panel/traffic/live?${qs.toString()}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`poll failed (${res.status})`)
    const data = (await res.json()) as PollResponse
    watermark.current = data.serverTime
    setRows(data.rows)
    const fresh = data.rows.filter((r) => r.isNew).map((r) => r.id)
    setHighlighted(new Set(fresh))
    setLastPolled(data.serverTime)
    return fresh.length
  }, [q, cls, days])

  useEffect(() => {
    if (!live) {
      setPollError(null)
      setHighlighted(new Set())
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const n = await poll()
        if (cancelled) return
        if (n > 0) setNewCount((c) => c + n)
        setPollError(null)
      } catch (e) {
        if (!cancelled) setPollError((e as Error).message)
      }
    }
    tick()
    const iv = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [live, poll])

  const colCount = isAdmin ? 14 : 10

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="live-toggle"
                checked={live}
                onCheckedChange={setLive}
                aria-label="Toggle live auto-refresh every 5 seconds"
              />
              <Label
                htmlFor="live-toggle"
                className={cn('cursor-pointer flex items-center gap-1.5 text-sm font-medium', live && 'text-emerald-600 dark:text-emerald-400')}
              >
                {live ? (
                  <>
                    <span className="relative flex size-2" aria-hidden>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex rounded-full size-2 bg-emerald-600" />
                    </span>
                    LIVE
                  </>
                ) : (
                  'Live'
                )}
              </Label>
              <span className="text-xs text-muted-foreground" aria-hidden>
                {live ? `auto-refresh ${POLL_MS / 1000}s` : 'off'}
              </span>
              {live && newCount > 0 && (
                <Badge className="bg-emerald-600 text-white border-emerald-600">{newCount} new</Badge>
              )}
              {live && lastPolled && (
                <span className="text-xs text-muted-foreground">updated {timeAgo(lastPolled)}</span>
              )}
              {pollError && (
                <span role="alert" className="text-xs text-destructive">{pollError}</span>
              )}
            </div>
            <span aria-live="polite" className="sr-only">
              {live
                ? `Live mode on. ${rows.length} messages, ${newCount} new since live started.`
                : 'Live mode off.'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{rows.length} message(s)</p>
            <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-8 px-4 py-3 font-medium"><span className="sr-only">Select</span></th>
                <th className="px-2 py-3 font-medium">When</th>
                <th className="px-2 py-3 font-medium">From</th>
                <th className="px-2 py-3 font-medium">To</th>
                <th className="px-2 py-3 font-medium">Class</th>
                <th className="px-2 py-3 font-medium">Seg</th>
                <th className="px-2 py-3 font-medium">Channel</th>
                {isAdmin ? (
                  <>
                    <th className="px-2 py-3 font-medium">User</th>
                    <th className="px-2 py-3 font-medium">User earns</th>
                    <th className="px-2 py-3 font-medium">Margin</th>
                    <th className="px-2 py-3 font-medium">True</th>
                    <th className="px-2 py-3 font-medium">Billing</th>
                  </>
                ) : (
                  <th className="px-2 py-3 font-medium">Your earning</th>
                )}
                <th className="px-2 py-3 font-medium">Msg</th>
                <th className="px-2 py-3 font-medium"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-muted-foreground">
                    No messages for these filters.
                  </td>
                </tr>
              )}
              {rows.map((m) => {
                const isHi = highlighted.has(m.id)
                return (
                  <tr
                    key={m.id}
                    className={cn(
                      'border-b last:border-0 align-middle hover:bg-muted/40 transition-colors',
                      isHi && 'bg-emerald-500/10'
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <input type="checkbox" name="ids" value={m.id} aria-label={`Select ${m.id}`} className="size-4" />
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                      {fmtDateTime(m.receivedAt).slice(0, 17)}
                      {isHi && (
                        <Badge className="ml-2 bg-emerald-600 text-white border-emerald-600 text-[10px]">new</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-xs">{m.numberFrom}</td>
                    <td className="px-2 py-2.5 text-xs">
                      <span className="font-mono">+{m.numberTo}</span>
                      <span className="text-muted-foreground"> · {m.destination ?? 'unmatched'}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge variant={m.class === 'A2P' ? 'secondary' : 'outline'}>{m.class}</Badge>
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-xs">{m.segments}</td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">
                      {m.channel.toLowerCase()}
                      {m.simulated && <span className="ml-1 text-amber-600 dark:text-amber-400">· sim</span>}
                    </td>
                    {isAdmin ? (
                      <td className="px-2 py-2.5 text-xs">{m.userName ?? <span className="text-muted-foreground">unassigned</span>}</td>
                    ) : null}
                    {isAdmin ? <td className="px-2 py-2.5 tabular-nums text-xs text-emerald-600 dark:text-emerald-400">{m.simulated ? '—' : fmtMoney(m.userEarning, currency)}</td> : null}
                    {isAdmin ? <td className="px-2 py-2.5 tabular-nums text-xs text-amber-600 dark:text-amber-400">{m.simulated ? '—' : fmtMoney(m.marginKept ?? 0, currency)}</td> : null}
                    {isAdmin ? <td className="px-2 py-2.5 tabular-nums text-xs">{m.simulated ? '—' : fmtMoney(m.trueCost ?? 0, currency)}</td> : null}
                    {isAdmin ? (
                      <td className="px-2 py-2.5">
                        <Badge
                          variant={m.billingStatus === 'BILLED' ? 'secondary' : m.billingStatus === 'UNPRICED' ? 'destructive' : 'outline'}
                          className="text-[10px]"
                        >
                          {m.billingStatus}
                        </Badge>
                      </td>
                    ) : null}
                    {!isAdmin && (
                      <td className={cn('px-2 py-2.5 tabular-nums text-xs text-emerald-600 dark:text-emerald-400 font-medium')}>
                        {m.simulated ? 'sim test' : fmtMoney(m.userEarning, currency)}
                      </td>
                    )}
                    <td className="px-2 py-2.5">
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground underline">view</summary>
                        <p className="mt-1 max-w-96 text-xs bg-muted rounded p-2">{m.text}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          carried by {m.carriedBy.toLowerCase()} · {m.upstreamId ? `id ${m.upstreamId}…` : 'no upstream id'}
                        </p>
                      </details>
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="submit"
                        name="id"
                        value={m.id}
                        formAction={deleteMessages as unknown as (formData: FormData) => void}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete message"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
