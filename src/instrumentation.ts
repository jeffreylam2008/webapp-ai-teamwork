export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getApplicationEnvStatus } = await import('@/lib/env-config.server');
    const status = getApplicationEnvStatus();
    if (!status.ok) {
      console.error(`[startup] ${status.message}`);
      return;
    }
    const { refreshAppTimezoneFromDb } = await import('@/lib/systemTimezoneServer');
    await refreshAppTimezoneFromDb();
  }
}
