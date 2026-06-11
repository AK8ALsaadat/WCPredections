export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_AUTO_SYNC !== "false") {
    const { startAutoSync } = await import("@/services/sync.service");
    startAutoSync();
  }
}
