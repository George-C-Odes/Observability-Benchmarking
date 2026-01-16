import { exec } from 'child_process';
import { promisify } from 'util';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

const execAsync = promisify(exec);

export const GET = withApiRoute({ name: 'SYSTEM_API' }, async function GET() {
  const logger = createScopedServerLogger('SYSTEM_API');
  try {
    const systemInfo: Record<string, string> = {
      nodejs: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    // Get npm version
    try {
      const { stdout: npmVersion } = await execAsync('npm --version');
      systemInfo.npm = npmVersion.trim();
    } catch {
      systemInfo.npm = 'N/A';
    }

    // Get package versions from package.json
    try {
      const packageJson = require('../../../package.json') as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      systemInfo.nextjs = packageJson.dependencies?.next || 'N/A';
      systemInfo.react = packageJson.dependencies?.react || 'N/A';
      systemInfo.mui = packageJson.dependencies?.['@mui/material'] || 'N/A';
      systemInfo.typescript = packageJson.devDependencies?.typescript || 'N/A';
    } catch (e: unknown) {
      logger.error('Error reading package.json', e);
    }

    logger.info('System info', systemInfo);

    return okJson(systemInfo);
  } catch (error) {
    logger.error('Error getting system info', error);
    return errorFromUnknown(500, error, 'Failed to get system info');
  }
});
