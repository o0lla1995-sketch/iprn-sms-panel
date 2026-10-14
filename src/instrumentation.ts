export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // bootstrap guard: only once per server process
    const g = globalThis as unknown as { __iprnBoot?: boolean }
    if (g.__iprnBoot) return
    g.__iprnBoot = true
    try {
      // 1) ensure settings + admin (+ optional demo) exist — gateway reads its
      //    port from settings, so seeding runs first
      const { ensureSeeded } = await import('@/lib/seed')
      await ensureSeeded()
    } catch (e) {
      console.error('[boot] seeding failed (continuing):', (e as Error).message)
    }
    try {
      const { startGateway } = await import('@/lib/smpp/gateway')
      await startGateway()
    } catch (e) {
      console.error('[boot] smpp gateway failed to start:', (e as Error).message)
    }
  }
}
