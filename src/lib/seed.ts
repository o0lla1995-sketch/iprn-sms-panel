/**
 * IPRN SMS Traffic Panel — self-seeding (runs from instrumentation on boot).
 * - Always: settings defaults + bootstrap admin from env + settlement rate groups
 * - SEED_DEMO=true: demo agent/users, real DIDs, demo traffic, payouts
 * Idempotent: safe on every boot.
 */
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const rand = (n: number) => randomBytes(n).toString('hex')
const apiKey = () => 'usr_' + rand(16)

// Real settlement groups from upstream platform ("Settlement Rates — All numbers in the system")
const RATE_GROUPS: [string, string, number, number][] = [
  ['A2P PHILIPPINES', 'A2P', 0.022, 3],
  ['A2P UK', 'A2P', 0.0085, 1576],
  ['Afghanistan01', 'BOTH', 0.0064, 1],
  ['Afghanistan9373003SW', 'BOTH', 0.0024, 1],
  ['Afghanistan9374401SW', 'BOTH', 0.0024, 1],
  ['Afghanistan9378008SW', 'BOTH', 0.0024, 1],
  ['Algeria', 'BOTH', 0.015, 4000],
  ['Algeria Premium', 'BOTH', 0.018, 1000],
  ['Algeria Azure', 'BOTH', 0.012, 9387],
  ['Algeria Azure Random', 'BOTH', 0.018, 4997],
  ['Angola', 'BOTH', 0.015, 5000],
  ['Angola Azure', 'BOTH', 0.0175, 5000],
  ['Azerbaijan08', 'BOTH', 0.0096, 1],
  ['Bangladesh Akira', 'BOTH', 0.009, 1000],
  ['Bangladesh004', 'BOTH', 0.0072, 1],
  ['Bangladesh013', 'BOTH', 0.0096, 1],
  ['Bangladesh016', 'BOTH', 0.0096, 1],
  ['Bangladesh017', 'BOTH', 0.0096, 2],
  ['Bangladesh019', 'BOTH', 0.0096, 1],
  ['Bangladesh020', 'BOTH', 0.0096, 1],
  ['Bangladesh021', 'BOTH', 0.0096, 2],
  ['Bangladesh023', 'BOTH', 0.0096, 1],
  ['Bangladesh05', 'BOTH', 0.0072, 1],
  ['Bangladesh06', 'BOTH', 0.0096, 1],
  ['Bangladesh07v2Grameen', 'BOTH', 0.0096, 1],
  ['Bangladesh12', 'BOTH', 0.0096, 1],
  ['Belgium', 'BOTH', 0.015, 8],
  ['Bolivia', 'BOTH', 0.0153, 1000],
  ['CRRussia030', 'BOTH', 0.0104, 1],
  ['Cambodia', 'BOTH', 0.015, 10000],
  ['Cambodia Azure', 'BOTH', 0.0175, 5000],
  ['Cambodia Azure Apple', 'BOTH', 0.018, 4999],
  ['CapeVerde2380250SW', 'BOTH', 0.0068, 1],
  ['CapeVerde2385220SW', 'BOTH', 0.0068, 1],
  ['CapeVerde2389070SW', 'BOTH', 0.0068, 1],
  ['Ecuador', 'BOTH', 0.021, 2],
  ['Egypt', 'BOTH', 0.015, 264],
  ['Egypt Azure', 'BOTH', 0.01, 1131],
  ['Egypt sms', 'BOTH', 0.0104, 250],
  ['Egypt11', 'BOTH', 0.0088, 1],
  ['Ethiopia Safaricom Beige', 'BOTH', 0.01, 1000],
  ['Etisalat - Etisalat Egypt', 'BOTH', 0.0166, 4],
  ['GB', 'P2P', 0.01, 23],
  ['Germany', 'BOTH', 0.0175, 1000],
  ['Germany Vodafone', 'BOTH', 0.016, 1],
  ['Germany-D', 'BOTH', 0.0085, 30],
  ['Ghana03', 'BOTH', 0.0096, 1],
  ['Ghana2332603SW', 'BOTH', 0.0068, 1],
  ['Ghana2335233SW', 'BOTH', 0.0068, 1],
  ['Great Britain', 'BOTH', 0.015, 30],
  ['Guinea01', 'BOTH', 0.0056, 1],
  ['Haiti Azure Random', 'BOTH', 0.018, 4999],
  ['Honduras', 'BOTH', 0.025, 1],
  ['Indonesia011', 'BOTH', 0.0096, 1],
  ['Indonesia04', 'BOTH', 0.0096, 1],
  ['Indonesia07', 'BOTH', 0.0096, 1],
  ['Indonesia09', 'BOTH', 0.0096, 1],
  ['Indonesia6288122SW', 'BOTH', 0.0068, 1],
  ['Italy Vienna', 'BOTH', 0.003, 100],
  ['Jordan04', 'BOTH', 0.0068, 1],
  ['KYRGYZSTAN04', 'BOTH', 0.0096, 1],
  ['Kenya2544754SW', 'BOTH', 0.0068, 1],
  ['Kenya2547700SW', 'BOTH', 0.0068, 1],
  ['Kuwait9655001SW', 'BOTH', 0.0068, 1],
  ['Kyrgyzstan', 'BOTH', 0.025, 104],
  ['Libya15Jan', 'BOTH', 0.008, 1],
  ['Libya2189101SW', 'BOTH', 0.0068, 1],
  ['Macedonia', 'BOTH', 0.016, 3],
  ['Malaysia', 'BOTH', 0.015, 10000],
  ['Malaysia Azure', 'BOTH', 0.0175, 7481],
  ['Malaysia Maxis Azure', 'BOTH', 0.0175, 5000],
  ['Mali04', 'BOTH', 0.0064, 1],
  ['Morocco05', 'BOTH', 0.0096, 1],
  ['Myanmar', 'BOTH', 0.015, 5000],
  ['Myanmar Azure Random', 'BOTH', 0.018, 5000],
  ['Myanmar Mid9', 'BOTH', 0.0175, 5000],
  ['Myanmar06', 'BOTH', 0.0096, 1],
  ['Myanmar08', 'BOTH', 0.0096, 1],
  ['MyanmarTelenorc', 'BOTH', 0.008, 1],
  ['New', 'BOTH', 0.015, 5000],
  ['Niger2277022SW', 'BOTH', 0.0068, 1],
  ['Niger2278007SW', 'BOTH', 0.0068, 1],
  ['Niger2279096SW', 'BOTH', 0.0068, 1],
  ['NigerOrangec', 'BOTH', 0.008, 1],
  ['Nigeria017', 'BOTH', 0.008, 1],
  ['Nigeria018', 'BOTH', 0.008, 1],
  ['Nigeria019', 'BOTH', 0.008, 1],
  ['Nigeria020', 'BOTH', 0.008, 1],
  ['Nigeria021', 'BOTH', 0.008, 1],
  ['Nigeria022', 'BOTH', 0.008, 1],
  ['Nigeria023', 'BOTH', 0.008, 1],
  ['Nigeria024', 'BOTH', 0.008, 1],
  ['Nigeria025', 'BOTH', 0.008, 1],
  ['Nigeria026', 'BOTH', 0.008, 1],
  ['Nigeria027', 'BOTH', 0.0064, 1],
  ['Nigeria2348090SW', 'BOTH', 0.0068, 1],
  ['Nigeria2349082SW', 'BOTH', 0.0068, 1],
  ['NigeriaEtisalatc', 'BOTH', 0.008, 1],
  ['Oman', 'BOTH', 0.015, 5000],
]

// Real DID patterns observed on the platform (Numbers / Access List pages)
const DEMO_DIDS: { number: string; destination: string; trueRate: number; class?: string }[] = [
  { number: '213562242832', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242833', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242837', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242840', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242841', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242843', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242846', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242847', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242850', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242852', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242853', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213562242855', destination: 'Algeria Azure', trueRate: 0.012 },
  { number: '213561711234', destination: 'Algeria Premium', trueRate: 0.018 },
  { number: '213561654321', destination: 'Algeria Premium', trueRate: 0.018 },
  { number: '201195121234', destination: 'Egypt', trueRate: 0.015 },
  { number: '201195125678', destination: 'Egypt', trueRate: 0.015 },
  { number: '201195137777', destination: 'Egypt sms', trueRate: 0.0104 },
  { number: '201195129999', destination: 'Egypt', trueRate: 0.015 },
]

const SENDERS: [string, boolean][] = [
  ['PayPal', true], ['TikTok', true], ['WhatsApp', true], ['Binance', true],
  ['ChatGPT', true], ['DISCORD', true], ['WeChat', true], ['Viber', true],
  ['Bybit', true], ['SPOTIFY', true], ['inDrive', true], ['Huawei', true],
  ['447873071122', false], ['198953491180', false], ['153072316655', false], ['276007341290', false],
]

const TEXTS = [
  (c: string, b: string) => `${b} code: ${c}. Don't share it with anyone.`,
  (c: string, b: string) => `Your ${b} verification code is ${c}. It expires in 10 minutes.`,
  (c: string) => `${c} is your one-time code.`,
  (c: string, b: string) => `[${b}] Confirm your number with code ${c}`,
  (c: string) => `Use ${c} to verify your account. Do not forward.`,
]

async function seedSettings() {
  const defaults: Record<string, string> = {
    site_name: 'IPRN SMS Traffic Panel',
    currency: 'USD',
    default_margin: '30',
    min_payout: '200',
    weekly_factoring_percent: '30',
    self_service_numbers: 'true',
    auto_dlr: 'true',
    upstream_base_url: process.env.UPSTREAM_BASE_URL || 'https://sms.carefulsupport.com',
    upstream_api_key: process.env.UPSTREAM_API_KEY || '',
    upstream_smpp_system_id: process.env.UPSTREAM_SMPP_SYSTEM_ID || 'iprn-gw01',
    upstream_smpp_password: process.env.UPSTREAM_SMPP_PASSWORD || 'ChangeMe!2026',
    smpp_port: process.env.SMPP_PORT || '2775',
    public_url: process.env.PUBLIC_URL || '',
    mo_webhook_secret: process.env.MO_WEBHOOK_SECRET || rand(12),
    platform_egress_ip: '35.224.28.251',
  }
  for (const [key, value] of Object.entries(defaults)) {
    const existing = await db.setting.findUnique({ where: { key } })
    // Never overwrite admin-edited values; only fill missing ones
    if (!existing) await db.setting.create({ data: { key, value } })
  }
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@iprn.local').toLowerCase()
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345'
  const existing = await db.user.findFirst({ where: { role: 'ADMIN' } })
  if (existing) return existing
  return db.user.create({
    data: {
      email,
      name: 'Platform Administrator',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'ADMIN',
      marginPercent: 30,
      apiKey: apiKey(),
    },
  })
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function seedDemo() {
  if (process.env.SEED_DEMO !== 'true') return
  const already = await db.user.findFirst({ where: { email: 'user1@demo.local' } })
  if (already) return

  const agent = await db.user.create({
    data: {
      email: 'agent1@demo.local',
      name: 'Demo Agent',
      passwordHash: await bcrypt.hash('demo1234', 10),
      role: 'AGENT',
      agentCommissionPercent: 10,
      apiKey: apiKey(),
      smppSystemId: 'agent1bind',
      smppPassword: 'demo1234',
    },
  })
  const user1 = await db.user.create({
    data: {
      email: 'user1@demo.local',
      name: 'Demo User One',
      passwordHash: await bcrypt.hash('demo1234', 10),
      role: 'USER',
      marginPercent: 30,
      payoutSchedule: 'MONTHLY',
      apiKey: apiKey(),
      smppSystemId: 'user1bind',
      smppPassword: 'demo1234',
    },
  })
  const user2 = await db.user.create({
    data: {
      email: 'user2@demo.local',
      name: 'Demo User Two',
      passwordHash: await bcrypt.hash('demo1234', 10),
      role: 'USER',
      parentId: agent.id,
      marginPercent: 25,
      payoutSchedule: 'WEEKLY',
      apiKey: apiKey(),
      smppSystemId: 'user2bind',
      smppPassword: 'demo1234',
    },
  })

  const dids = await Promise.all(
    DEMO_DIDS.map((d) =>
      db.did.create({
        data: {
          number: d.number,
          destination: d.destination,
          model: 'PRN',
          class: d.class || 'BOTH',
          capability: 'TWO_WAY',
          trueRate: d.trueRate,
          status: 'AVAILABLE',
          source: 'DEMO',
        },
      })
    )
  )

  // Assign numbers: user1 → Algeria Azure(0-7) + Egypt(14-15,17); user2 → Algeria Azure(8-11) + Algeria Premium(12-13); rest available
  const assign = async (idx: number, userId: string) => {
    await db.did.update({
      where: { id: dids[idx].id },
      data: { status: 'ASSIGNED', assignedUserId: userId, assignedAt: new Date() },
    })
  }
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 14, 15, 17]) await assign(i, user1.id)
  for (const i of [8, 9, 10, 11, 12, 13]) await assign(i, user2.id)

  // ── Simulated 14 days of traffic ──
  const assigned = await db.did.findMany({ where: { status: 'ASSIGNED' }, include: { assignedUser: true } })
  const now = Date.now()
  let count = 0
  for (const did of assigned) {
    const user = did.assignedUser!
    const msgs = 12 + Math.floor(Math.random() * 20)
    for (let i = 0; i < msgs; i++) {
      const daysAgo = Math.random() * 13.5
      const when = new Date(now - daysAgo * 86400000 - Math.random() * 40000000)
      const [sender, isAlpha] = pick(SENDERS)
      const code = String(100000 + Math.floor(Math.random() * 899999))
      const text = pick(TEXTS)(code, pick(['PayPal', 'TikTok', 'WhatsApp', 'Binance', 'ChatGPT']))
      const simulated = Math.random() < 0.04
      const trueRate = simulated ? 0 : did.trueRate
      const margin = user.marginPercent
      const userEarning = simulated ? 0 : +(trueRate * (1 - margin / 100)).toFixed(4)
      const marginKept = simulated ? 0 : +(trueRate - userEarning).toFixed(4)
      const dedupHash = `demo|${did.number}|${sender}|${code}|${when.getTime()}`
      const msg = await db.message.create({
        data: {
          dedupHash,
          didId: did.id,
          numberTo: did.number,
          numberFrom: sender,
          text,
          segments: text.length > 160 ? 2 : 1,
          class: isAlpha ? 'A2P' : 'P2P',
          channel: 'SMPP',
          simulated,
          carriedBy: Math.random() < 0.75 ? 'PANEL' : 'USER',
          userId: user.id,
          trueCost: trueRate,
          userEarning,
          marginKept,
          billingStatus: simulated ? 'ZERO' : daysAgo > 1 ? 'BILLED' : 'PENDING',
          receivedAt: when,
        },
      })
      count++
      if (!simulated && userEarning > 0) {
        const fresh = await db.user.update({
          where: { id: user.id },
          data: { walletBalance: { increment: userEarning } },
        })
        await db.transaction.create({
          data: {
            userId: user.id,
            type: 'EARNING',
            amount: userEarning,
            balanceAfter: fresh.walletBalance,
            messageId: msg.id,
            note: 'demo',
            createdAt: when,
          },
        })
        if (user.parentId) {
          const comm = +(userEarning * 0.1).toFixed(4)
          const agentFresh = await db.user.update({
            where: { id: user.parentId },
            data: { walletBalance: { increment: comm } },
          })
          await db.transaction.create({
            data: {
              userId: user.parentId,
              type: 'COMMISSION',
              amount: comm,
              balanceAfter: agentFresh.walletBalance,
              messageId: msg.id,
              note: 'demo',
              createdAt: when,
            },
          })
        }
      }
    }
    await db.did.update({ where: { id: did.id }, data: { lastTrafficAt: new Date(now - Math.random() * 6 * 86400000) } })
  }

  // A historical PAID payout for user1 + a PENDING request for user2
  const u1 = await db.user.findUnique({ where: { id: user1.id } })
  if (u1 && u1.walletBalance > 60) {
    const amount = 50
    const fresh = await db.user.update({ where: { id: user1.id }, data: { walletBalance: { decrement: amount } } })
    const payout = await db.payoutRequest.create({
      data: {
        userId: user1.id,
        amount,
        feePercent: 0,
        fee: 0,
        net: amount,
        schedule: 'MONTHLY',
        method: 'Bank transfer (demo)',
        status: 'PAID',
        processedAt: new Date(now - 5 * 86400000),
        createdAt: new Date(now - 7 * 86400000),
      },
    })
    await db.transaction.create({
      data: {
        userId: user1.id,
        type: 'PAYOUT',
        amount: -amount,
        balanceAfter: fresh.walletBalance,
        payoutId: payout.id,
        note: 'demo',
        createdAt: new Date(now - 5 * 86400000),
      },
    })
  }

  await db.auditLog.create({
    data: {
      action: 'SEED_DEMO',
      detail: `Seeded demo data: 3 users, ${dids.length} DIDs, ${count} messages`,
    },
  })
  console.log(`[seed] demo data: 3 users, ${dids.length} DIDs, ${count} messages`)
}

/** Boot-time seeding — call from instrumentation (or scripts/seed.ts). */
export async function ensureSeeded(): Promise<void> {
  await seedSettings()
  const admin = await seedAdmin()
  await seedDemo()
  const rates = await db.rateGroup.count()
  if (rates === 0) {
    await db.rateGroup.createMany({
      data: RATE_GROUPS.map(([destination, cls, trueRate, n]) => ({
        destination,
        class: cls,
        trueRate,
        numbersCount: n,
      })),
    })
    console.log(`[seed] rate groups: ${RATE_GROUPS.length}`)
  }
  console.log(`[seed] ready — admin: ${admin.email}`)
}
