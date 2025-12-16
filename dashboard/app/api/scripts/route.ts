import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';

const RUN_DIR_PATH = path.join(process.cwd(), '..', '.run');

interface Script {
  name: string;
  description: string;
  command: string;
}

async function parseRunXmlFile(filePath: string, fileName: string): Promise<Script | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const result = await parseStringPromise(content);

    const config = result.component?.configuration?.[0];
    if (!config) return null;

    const name = config.$?.name || fileName.replace('.run.xml', '');
    const scriptText = config.option?.find((opt: any) => opt.$?.name === 'SCRIPT_TEXT')?.$?.value || '';

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
    };
  } catch (error) {
    console.error(`Error parsing ${fileName}:`, error);
    return null;
  }
}

export async function GET() {
  try {
    const files = await fs.readdir(RUN_DIR_PATH);
    const xmlFiles = files.filter((file) => file.endsWith('.run.xml'));

    const scriptPromises = xmlFiles.map(async (file) => {
      const filePath = path.join(RUN_DIR_PATH, file);
      return parseRunXmlFile(filePath, file);
    });

    const scriptsWithNull = await Promise.all(scriptPromises);
    const scripts = scriptsWithNull.filter((script): script is Script => script !== null);

    return NextResponse.json({ scripts });
  } catch (error) {
    console.error('Error reading .run directory:', error);
    return NextResponse.json(
      { error: 'Failed to read scripts directory' },
      { status: 500 }
    );
  }
}
