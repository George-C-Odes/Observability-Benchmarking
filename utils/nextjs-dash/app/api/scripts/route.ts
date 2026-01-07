import { NextResponse } from 'next/server';
import { getCommandPresets } from '@/lib/orchestratorClient';

/**
 * GET /api/scripts
 * Fetches command presets from the orchestrator service
 */
export async function GET() {
  try {
    console.log(`[SCRIPTS API] Fetching presets from orchestrator`);
    
    const presets = await getCommandPresets();
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
