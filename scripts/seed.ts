/** Manual seeding entry — same logic the app runs on boot. */
import { ensureSeeded } from '@/lib/seed'

ensureSeeded()
  .then(() => console.log('[seed] done'))
  .catch((e) => {
    console.error('[seed] failed:', e)
    process.exit(1)
  })
  .finally(() => import('@prisma/client').then(({ PrismaClient }) => new PrismaClient().$disconnect()))
