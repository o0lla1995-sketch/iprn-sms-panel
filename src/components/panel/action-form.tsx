'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActionResult {
  ok: boolean
  error?: string
  message?: string
  secret?: string
  secretLabel?: string
}

/**
 * Form wrapper around a server action used with useActionState.
 * Server actions used here MUST have the signature (prevState, formData).
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  variant = 'default',
  size = 'sm',
  className,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>
  children?: React.ReactNode
  submitLabel: string
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'link'
  size?: 'sm' | 'default'
  className?: string
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null)
  return (
    <form action={formAction} className={cn('space-y-2', className)}>
      {children}
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {submitLabel}
      </Button>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state?.ok && state.message && !state.secret && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{state.message}</p>
      )}
      {state?.ok && state.secret && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2">
          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mb-1">
            {state.secretLabel ?? 'Copy now — shown once'}
          </p>
          <code className="block font-mono text-xs break-all select-all whitespace-pre-wrap">{state.secret}</code>
        </div>
      )}
    </form>
  )
}
