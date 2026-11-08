/**
 * Runs once when a Next.js server starts. Starts the scheduler (scheduled sends and
 * picking up interrupted sends), but not while building and not in the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
