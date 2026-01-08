import { getCommandPresets } from '@/lib/orchestratorClient';
import { serverLogger } from '@/lib/serverLogger';
import { errorFromUnknown, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

type OrchestratorPreset = {
  title: string;
  command: string;
  category: 'build-img' | 'multi-cont' | 'single-cont' | 'test' | string;
  sourceFile: string;
};

/**
 * GET /api/scripts
 * Fetches command presets from the orchestrator service
 */
export const GET = withApiRoute({ name: 'SCRIPTS_API' }, async function GET() {
  try {
    serverLogger.info('Fetching presets from orchestrator');

    const presets = await getCommandPresets();
    serverLogger.info(`Fetched ${presets.length} command presets from orchestrator`);

    // Transform orchestrator response to match frontend expectations
    const scripts = (presets as OrchestratorPreset[]).map((preset) => ({
      name: preset.title,
      description: `${preset.category} command`,
      command: preset.command,
      category: preset.category,
      sourceFile: preset.sourceFile,
    }));

    return okJson({ scripts });
  } catch (error) {
    serverLogger.error('Error fetching from orchestrator:', error);
    return errorFromUnknown(500, error, 'Failed to fetch scripts from orchestrator service');
  }
});
