'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { importNumbers } from './actions'
import { CircleCheck, TriangleAlert } from 'lucide-react'

/**
 * ADMIN card: bulk import of numbers from pasted CSV/JSON lines.
 * Every line is auto-priced from the Rate Groups; an optional rate override
 * column wins; existing numbers are skipped (idempotent).
 */
export function ImportNumbersCard({ currency }: { currency: string }) {
  const [result, formAction, pending] = useActionState(importNumbers, null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bulk import — auto-priced</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="import-list">CSV lines or JSON lines — one number per line</Label>
              <textarea
                id="import-list"
                name="list"
                required
                rows={5}
                className="font-mono text-xs flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 shadow-xs"
                placeholder={
                  '213562242832,Algeria Azure,BOTH\n{"number":"201000112233","destination":"Egypt","class":"A2P"}\n213562242834,Algeria Premium,A2P,0.0180'
                }
                aria-describedby="import-help"
              />
              <p id="import-help" className="text-xs text-muted-foreground">
                Fields: number, destination, class, capability, model — plus an optional rate override column.
                Existing numbers are skipped (idempotent).
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="import-destination">Fallback destination</Label>
                <Input id="import-destination" name="destination" placeholder="e.g. Unassigned" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-rate">Fallback rate ({currency}) when no rate group matches</Label>
                <Input id="import-rate" name="rate" type="number" step="0.0001" min="0" placeholder="0.0000" />
              </div>
              <p className="text-xs text-muted-foreground">
                Each line is priced automatically from your Rate Groups — exact destination match first, then
                partial match; the highest matching rate wins. An explicit rate column always overrides.
              </p>
            </div>
          </div>

          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? 'Importing…' : 'Import & auto-price'}
          </Button>

          {result && (
            <div role="status" aria-live="polite" className="rounded-lg border p-3 text-sm space-y-1.5">
              <p className="flex items-start gap-2 font-medium">
                <CircleCheck className="size-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                {result.added} added · {result.existed} already existed (skipped) · {result.priced} priced
              </p>
              {result.unpriced.length > 0 && (
                <p className="flex items-start gap-2 text-amber-600 dark:text-amber-400 text-xs">
                  <TriangleAlert className="size-3.5 mt-0.5 shrink-0" aria-hidden />
                  {result.unpriced.length} unpriced (no rate group match): {result.unpriced.slice(0, 5).join(', ')}
                  {result.unpriced.length > 5 ? '…' : ''}
                </p>
              )}
              {result.errors.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Skipped lines: {result.errors.slice(0, 5).join(' | ')}
                  {result.errors.length > 5 ? '…' : ''}
                </p>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
