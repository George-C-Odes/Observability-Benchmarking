import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// Support both Docker and local paths
function getProjectRoot(): string {
  const dockerPath = process.cwd();
  const localPath = path.join(process.cwd(), '..');
  
  // Check if running in Docker (compose directory exists in cwd)
  try {
    if (require('fs').existsSync(path.join(dockerPath, 'compose'))) {
      return dockerPath;
    }
  } catch (e) {
    // Ignore
  }
  
  return localPath;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log(`[EXECUTE API] Received request:`, JSON.stringify(body));
    
    const { scriptName, command } = body;

    if (!scriptName || !command) {
      console.error('[EXECUTE API] Missing scriptName or command');
      return NextResponse.json(
        { error: 'Script name and command are required' },
        { status: 400 }
      );
    }

    // Security: Sanitize and validate inputs
    if (typeof scriptName !== 'string' || typeof command !== 'string') {
      console.error('[EXECUTE API] Invalid input types');
      return NextResponse.json(
        { error: 'Invalid input types' },
        { status: 400 }
      );
    }

    // Security: Only allow specific command prefixes
    const allowedPrefixes = ['docker compose', 'mvn'];
    const hasAllowedPrefix = allowedPrefixes.some(prefix => command.startsWith(prefix));
    
    if (!hasAllowedPrefix) {
      console.error('[EXECUTE API] Command not whitelisted:', command);
      return NextResponse.json(
        { error: 'Only docker compose and mvn commands are allowed' },
        { status: 403 }
      );
    }

    // Security: Prevent command injection by checking for dangerous characters
    const dangerousPatterns = [';', '&&', '||', '|', '`', '$', '(', ')', '<', '>'];
    const hasDangerousChars = dangerousPatterns.some(pattern => 
      scriptName.includes(pattern) || command.includes(pattern)
    );

    if (hasDangerousChars) {
      console.error('[EXECUTE API] Dangerous characters detected');
      return NextResponse.json(
        { error: 'Command contains potentially dangerous characters' },
        { status: 403 }
      );
    }

    const projectRoot = getProjectRoot();
    console.log(`[EXECUTE API] Executing command in: ${projectRoot}`);
    console.log(`[EXECUTE API] Command: ${command}`);

    // Execute the command with a timeout
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 60000, // 60 second timeout
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
    });

    const output = stdout + (stderr ? `\nWarnings/Errors:\n${stderr}` : '');
    console.log(`[EXECUTE API] Command completed successfully`);

    return NextResponse.json({
      success: true,
      output: output || 'Command executed successfully (no output)',
      scriptName,
    });
  } catch (error: any) {
    console.error('[EXECUTE API] Error executing script:', error);
    
    const errorMessage = error.message || 'Unknown error occurred';
    const output = error.stdout || error.stderr || errorMessage;

    return NextResponse.json(
      {
        error: 'Failed to execute script',
        details: errorMessage,
        output,
      },
      { status: 500 }
    );
  }
}
