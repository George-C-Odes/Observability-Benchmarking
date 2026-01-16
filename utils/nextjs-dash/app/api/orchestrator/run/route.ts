import { NextRequest } from 'next/server';
import { POST as submitPOST } from '@/app/api/orchestrator/submit/route';

/**
 * POST /api/orchestrator/run
 *
 * Backwards-compatible alias for /api/orchestrator/submit.
 * Some UI / hooks historically used "/run" while the server route is "/submit".
 */
export async function POST(request: NextRequest) {
  return submitPOST(request);
}
