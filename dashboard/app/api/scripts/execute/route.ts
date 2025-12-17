import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const PROJECT_ROOT = path.join(process.cwd(), '..');

export async function POST(request: NextRequest) {
  try {
    const { scriptName, command } = await request.json();

    if (!scriptName || !command) {
      return NextResponse.json(
        { error: 'Script name and command are required' },
        { status: 400 }
      );
    }

    // Security: Sanitize and validate inputs
    if (typeof scriptName !== 'string' || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input types' },
        { status: 400 }
      );
    }

    // Security: Only allow specific command prefixes
    const allowedPrefixes = ['docker compose', 'mvn'];
    const hasAllowedPrefix = allowedPrefixes.some(prefix => command.startsWith(prefix));
    
    if (!hasAllowedPrefix) {
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
      return NextResponse.json(
        { error: 'Command contains potentially dangerous characters' },
        { status: 403 }
      );
    }

    // Execute the command with a timeout
    const { stdout, stderr } = await execAsync(command, {
      cwd: PROJECT_ROOT,
      timeout: 60000, // 60 second timeout
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
    });

    const output = stdout + (stderr ? `\nWarnings/Errors:\n${stderr}` : '');

    return NextResponse.json({
      success: true,
      output: output || 'Command executed successfully (no output)',
      scriptName,
    });
  } catch (error: any) {
    console.error('Error executing script:', error);
    
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
