import { NextRequest } from 'next/server'
import { authApiKey, json } from '@/lib/apikey'

export async function GET(req: NextRequest) {
  const user = await authApiKey(req)
  if (!user) return json({ ok: false, error: 'invalid x-api-key' }, 401)
  return json({
    ok: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      wallet_balance: Number(user.walletBalance.toFixed(4)),
      payout_schedule: user.payoutSchedule,
      api_key_hint: user.apiKey.slice(0, 8) + '…',
    },
  })
}
