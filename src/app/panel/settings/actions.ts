'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getSession, genSecret, genPassword } from '@/lib/auth'
import { getSettings, setSettings } from '@/lib/settings'
import { setMoWebhook, testUpstreamConnection } from '@/lib/upstream'

async function admin() {
  const s = await getSession()
  if (!s || s.role !== 'ADMIN') throw new Error('Admin only')
  return s
}

export async function saveUpstream(_prev: unknown, formData: FormData) {
  try {
    const s = await admin()
    const values: Record<string, string> = {
      upstream_base_url: String(formData.get('upstream_base_url') || '').trim() || 'https://sms.carefulsupport.com',
      upstream_api_key: String(formData.get('upstream_api_key') || '').trim(),
      public_url: String(formData.get('public_url') || '').trim().replace(/\/+$/, ''),
    }
    const smppId = String(formData.get('upstream_smpp_system_id') || '').trim()
    const smppPass = String(formData.get('upstream_smpp_password') || '').trim()
    if (smppId) values.upstream_smpp_system_id = smppId
    if (smppPass) values.upstream_smpp_password = smppPass
    values.auto_dlr = formData.get('auto_dlr') === 'on' ? 'true' : 'false'
    await setSettings(values)
    await db.auditLog.create({
      data: { actorId: s.uid, actorEmail: s.email, action: 'SETTINGS_UPSTREAM', entity: 'Setting', detail: 'upstream config saved' },
    })
    revalidatePath('/panel/settings')
    return { ok: true, message: 'Upstream settings saved' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function rotateMoSecret(_prev: unknown) {
  try {
    const s = await admin()
    const secret = genSecret(14)
    await setSettings({ mo_webhook_secret: secret })
    await db.auditLog.create({
      data: { actorId: s.uid, actorEmail: s.email, action: 'MO_SECRET_ROTATE', entity: 'Setting', detail: 'webhook path secret rotated' },
    })
    revalidatePath('/panel/settings')
    return { ok: true, message: 'New webhook path generated — reconnect the webhook to apply it', secret, secretLabel: 'New mo-webhook path secret' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function connectMoWebhook(_prev: unknown, formData: FormData) {
  try {
    const s = await admin()
    const settings = await getSettings()
    const mode = String(formData.get('mode') || 'on')
    if (mode === 'off') {
      const res = await setMoWebhook(null)
      await db.rawEvent.create({ data: { source: 'API', payload: JSON.stringify({ op: 'mo_webhook_off', status: res.status, body: res.body.slice(0, 500) }), processed: res.ok } })
      return { ok: res.ok, message: res.ok ? 'Webhook cleared on the platform' : `Platform responded ${res.status}`, error: res.ok ? undefined : res.body.slice(0, 200) }
    }
    const base = settings.public_url
    if (!base) return { ok: false, error: 'Set the panel public URL first' }
    const url = `${base}/api/upstream/mo/${settings.mo_webhook_secret}`
    const res = await setMoWebhook(url)
    await db.rawEvent.create({ data: { source: 'API', payload: JSON.stringify({ op: 'mo_webhook_set', url, status: res.status, body: res.body.slice(0, 500) }), processed: res.ok } })
    await db.auditLog.create({ data: { actorId: s.uid, actorEmail: s.email, action: 'MO_WEBHOOK_SET', entity: 'Setting', detail: url } })
    return {
      ok: res.ok,
      message: res.ok ? 'Vendor-copy MO webhook now points at this panel' : `Platform responded ${res.status}`,
      secret: url,
      secretLabel: 'Webhook URL registered upstream',
      error: res.ok ? undefined : res.body.slice(0, 200),
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function testUpstream(_prev: unknown) {
  try {
    await admin()
    const res = await testUpstreamConnection()
    return {
      ok: res.ok,
      message: res.ok ? `Platform reachable (HTTP ${res.status})` : `Platform unreachable: ${res.body.slice(0, 160)}`,
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function saveSystem(_prev: unknown, formData: FormData) {
  try {
    const s = await admin()
    const values: Record<string, string> = {
      site_name: String(formData.get('site_name') || '').trim() || 'IPRN SMS Traffic Panel',
      currency: String(formData.get('currency') || 'USD').toUpperCase().slice(0, 3),
      default_margin: String(Math.min(90, Math.max(0, Number(formData.get('default_margin') || 30)))),
      min_payout: String(Math.max(1, Number(formData.get('min_payout') || 200))),
      weekly_factoring_percent: String(Math.min(90, Math.max(0, Number(formData.get('weekly_factoring_percent') || 30)))),
      self_service_numbers: formData.get('self_service_numbers') === 'on' ? 'true' : 'false',
    }
    await setSettings(values)
    await db.auditLog.create({
      data: { actorId: s.uid, actorEmail: s.email, action: 'SETTINGS_SYSTEM', entity: 'Setting', detail: JSON.stringify(values).slice(0, 300) },
    })
    revalidatePath('/panel/settings')
    return { ok: true, message: 'System settings saved' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function resetDemoData(_prev: unknown) {
  try {
    const s = await admin()
    const demoDids = await db.did.findMany({ where: { source: 'DEMO' }, select: { id: true } })
    const didIds = demoDids.map((d) => d.id)
    const demoMessages = await db.message.findMany({ where: { didId: { in: didIds } }, select: { id: true } })
    const msgIds = demoMessages.map((m) => m.id)

    await db.transaction.deleteMany({ where: { OR: [{ messageId: { in: msgIds } }, { note: 'demo' }] } })
    await db.payoutRequest.deleteMany({ where: { method: { contains: 'demo' } } })
    await db.message.deleteMany({ where: { id: { in: msgIds } } })
    await db.did.deleteMany({ where: { id: { in: didIds } } })
    await db.user.deleteMany({ where: { email: { endsWith: '@demo.local' } } })

    await db.auditLog.create({
      data: { actorId: s.uid, actorEmail: s.email, action: 'DEMO_RESET', entity: 'System', detail: `cleared ${msgIds.length} messages, ${didIds.length} numbers, demo users` },
    })
    revalidatePath('/panel/settings')
    return { ok: true, message: 'Demo data cleared — the panel is now production-clean' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Any role: own receiving channels + payout schedule. */
export async function saveMyChannel(_prev: unknown, formData: FormData) {
  const s = await getSession()
  if (!s) return { ok: false, error: 'Unauthenticated' }
  const webhookUrl = String(formData.get('webhookUrl') || '').trim()
  const webhookSecret = String(formData.get('webhookSecret') || '').trim()
  const schedule = String(formData.get('schedule') || 'MONTHLY').toUpperCase() === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY'
  if (webhookUrl && !/^https?:\/\/.+/i.test(webhookUrl)) return { ok: false, error: 'Webhook URL must be http(s)://' }
  await db.user.update({
    where: { id: s.uid },
    data: {
      webhookUrl: webhookUrl || null,
      webhookSecret: webhookSecret || null,
      payoutSchedule: schedule,
    },
  })
  await db.auditLog.create({
    data: { actorId: s.uid, actorEmail: s.email, action: 'CHANNEL_SAVE', entity: 'User', entityId: s.uid, detail: `webhook=${webhookUrl ? 'set' : 'cleared'} schedule=${schedule}` },
  })
  revalidatePath('/panel/settings')
  return { ok: true, message: 'Your channel settings saved' }
}

export async function regenMyApiKey(_prev: unknown) {
  const s = await getSession()
  if (!s) return { ok: false, error: 'Unauthenticated' }
  const { genApiKey } = await import('@/lib/auth')
  const key = genApiKey()
  await db.user.update({ where: { id: s.uid }, data: { apiKey: key } })
  return { ok: true, message: 'New API key', secret: key, secretLabel: 'Your new x-api-key — copy now, shown once' }
}

export async function issueMySmpp(_prev: unknown) {
  const s = await getSession()
  if (!s) return { ok: false, error: 'Unauthenticated' }
  const base = s.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase() || 'bind'
  const systemId = `${base}${Math.floor(100 + Math.random() * 900)}`
  const pass = genPassword()
  await db.user.update({ where: { id: s.uid }, data: { smppSystemId: systemId, smppPassword: pass } })
  return {
    ok: true,
    message: 'Bind into this panel as receiver/transceiver with these credentials',
    secret: `system_id: ${systemId}\npassword: ${pass}`,
    secretLabel: 'Your SMPP bind credentials — shown once',
  }
}
