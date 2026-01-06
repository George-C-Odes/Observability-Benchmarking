import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Basic health check - if we can execute this, the app is alive
    const health = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      application: 'nextjs-dash',
      version: '1.0.0',
      checks: {
        api: 'UP',
        orchestrator: 'UNKNOWN', // Would need to check orchestrator connectivity
      },
    };

    // Try to check orchestrator connectivity
    try {
      const orchUrl = process.env.ORCH_URL || 'http://orchestrator:3002';
      const orchResponse = await fetch(`${orchUrl}/q/health/ready`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });
      
      health.checks.orchestrator = orchResponse.ok ? 'UP' : 'DOWN';
    } catch (e) {
      health.checks.orchestrator = 'DOWN';
    }

    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      },
      { status: 503 }
    );
  }
}
