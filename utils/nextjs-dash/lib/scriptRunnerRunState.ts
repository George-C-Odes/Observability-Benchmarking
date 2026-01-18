/**
 * Minimal in-memory "active run" marker for the Script Runner.
 *
 * Why this exists:
 * - We observed stale browser pollers/streams sometimes keep firing across executions.
 * - By tagging each execution with a runId and letting the server reject requests that
 *   don't match the current runId, we stop the noisy cross-job mixing at the boundary.
 *
 * Notes:
 * - This is per Next.js server process (per container instance), which matches our
 *   docker-compose usage.
 * - If we ever scale horizontally, this should move to a shared store (Redis, etc.)
 *   or be encoded differently.
 */

let activeRunId: string | null = null;

export function setActiveRunId(runId: string | null) {
  activeRunId = runId;
}

export function getActiveRunId(): string | null {
  return activeRunId;
}

