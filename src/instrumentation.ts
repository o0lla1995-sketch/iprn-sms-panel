export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as unknown as { __iprnBoot?: boolean }
    if (g.__iprnBoot) return
    g.__iprnBoot = true

    // Never block request serving on seeding — run it in the background
    // and log the outcome. First boot creates admin + rate groups.
    import('@/lib/seed')
      .then(({ ensureSeeded }) => ensureSeeded())
      .catch((e) => console.error('[boot] seeding failed:', (e as Error).message))

    try {
      const { startGateway } = await import('@/lib/smpp/gateway')
      await startGateway()
    } catch (e) {
      console.error('[boot] smpp gateway failed to start:', (e as Error).message)
    }
  }
}
