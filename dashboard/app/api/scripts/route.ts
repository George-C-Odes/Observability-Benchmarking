import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';

// Support both Docker and local paths
function getRunDirPath(): string {
  const dockerPath = path.join(process.cwd(), '.run');
  const localPath = path.join(process.cwd(), '..', '.run');
  
  // Check if running in Docker (.run exists in cwd)
  try {
    if (require('fs').existsSync(dockerPath)) {
      return dockerPath;
    }
  } catch (e) {
    // Ignore
  }
  
  return localPath;
}

interface Script {
  name: string;
  description: string;
  command: string;
  category: 'build-img' | 'multi-cont' | 'single-cont' | 'test';
}

async function parseRunXmlFile(filePath: string, fileName: string): Promise<Script | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const result = await parseStringPromise(content);

    const config = result.component?.configuration?.[0];
    if (!config) return null;

    const name = config.$?.name || fileName.replace('.run.xml', '');
    const scriptText = config.option?.find((opt: any) => opt.$?.name === 'SCRIPT_TEXT')?.$?.value || '';

    // Determine category from filename prefix
    let category: Script['category'];
    if (fileName.startsWith('[build-img]')) {
      category = 'build-img';
    } else if (fileName.startsWith('[multi-cont]')) {
      category = 'multi-cont';
    } else if (fileName.startsWith('[single-cont]')) {
      category = 'single-cont';
    } else if (fileName.startsWith('[test]')) {
      category = 'test';
    } else {
      // Skip files without recognized prefix
      return null;
    }

    // Generate description based on the script content
    let description = 'Docker Compose script';
    if (scriptText.includes('--profile=OBS') && !scriptText.includes('--profile=SERVICES')) {
      description = 'Start Observability Stack only';
    } else if (scriptText.includes('--profile=SERVICES')) {
      description = 'Start Services with Observability';
    } else if (scriptText.includes('--profile=RAIN_FIRE')) {
      description = 'Run Load Generators';
    } else if (scriptText.includes('mvn')) {
      description = 'Build project with Maven';
    } else if (scriptText.includes('docker compose')) {
      description = 'Docker Compose command';
    }

    return {
      name,
      description,
      command: scriptText,
      category,
    };
  } catch (error) {
    console.error(`[SCRIPTS API] Error parsing ${fileName}:`, error);
    return null;
  }
}

export async function GET() {
  try {
    const runDirPath = getRunDirPath();
    console.log(`[SCRIPTS API] Reading .run directory from: ${runDirPath}`);
    
    const files = await fs.readdir(runDirPath);
    const xmlFiles = files.filter((file) => file.endsWith('.run.xml'));

    console.log(`[SCRIPTS API] Found ${xmlFiles.length} XML files`);

    const scriptPromises = xmlFiles.map(async (file) => {
      const filePath = path.join(runDirPath, file);
      return parseRunXmlFile(filePath, file);
    });

    const scriptsWithNull = await Promise.all(scriptPromises);
    const scripts = scriptsWithNull.filter((script): script is Script => script !== null);

    console.log(`[SCRIPTS API] Parsed ${scripts.length} valid scripts with prefixes`);

    return NextResponse.json({ scripts });
  } catch (error) {
    console.error('[SCRIPTS API] Error reading .run directory:', error);
    return NextResponse.json(
      { error: 'Failed to read scripts directory' },
      { status: 500 }
    );
  }
}
