/**
 * Rate / margin engine — THE commercial core of the panel.
 *
 * trueRate               : what the upstream platform actually pays the admin account (ADMIN ONLY).
 * userRate / userEarning : what the panel user sees and earns = trueRate * (1 - margin/100).
 * marginKept             : the hidden admin share = trueRate - userEarning.
 *
 * Non-admin roles must NEVER receive trueRate / marginKept from any API or page.
 */

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function deriveUserRate(trueRate: number, marginPercent: number): number {
  return round4(trueRate * (1 - marginPercent / 100))
}

export function computeSplit(trueRate: number, marginPercent: number) {
  const userEarning = deriveUserRate(trueRate, marginPercent)
  const marginKept = round4(trueRate - userEarning)
  return { userEarning, marginKept }
}

export function agentCommission(userEarning: number, commissionPercent: number): number {
  if (commissionPercent <= 0) return 0
  return round4(userEarning * (commissionPercent / 100))
}
