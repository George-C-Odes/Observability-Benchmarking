import { NextResponse } from 'next/server';

// Orchestrator service URL (from environment or default to docker-compose service name)
const ORCHESTRATOR_URL = process.env.ORCH_URL || 'http://orchestrator:4000';

export async function GET() {
  try {
    console.log(`[SCRIPTS API] Fetching presets from orchestrator: ${ORCHESTRATOR_URL}/v1/commands`);
    
    const response = await fetch(`${ORCHESTRATOR_URL}/v1/commands`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Orchestrator returned ${response.status}: ${response.statusText}`);
    }

    const presets = await response.json();
    console.log(`[SCRIPTS API] Fetched ${presets.length} command presets from orchestrator`);

    // Transform orchestrator response to match frontend expectations
    const scripts = presets.map((preset: any) => ({
      name: preset.title,
      description: `${preset.category} command`,
      command: preset.command,
      category: preset.category,
      sourceFile: preset.sourceFile,
    }));

    return NextResponse.json({ scripts });
  } catch (error) {
    console.error('[SCRIPTS API] Error fetching from orchestrator:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scripts from orchestrator service' },
      { status: 500 }
    );
  }
}
