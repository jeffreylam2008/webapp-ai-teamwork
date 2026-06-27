export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { refreshAppTimezoneFromDb } = await import('@/lib/systemTimezoneServer');
    await refreshAppTimezoneFromDb();
  }
}
