import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
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
      console.error('[SYSTEM API] Error reading package.json:', e);
    }

    console.log('[SYSTEM API] System info:', systemInfo);

    return NextResponse.json(systemInfo);
  } catch (error) {
    console.error('[SYSTEM API] Error getting system info:', error);
    return NextResponse.json(
      { error: 'Failed to get system info' },
      { status: 500 }
    );
  }
}
