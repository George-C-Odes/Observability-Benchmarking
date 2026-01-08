import { NextRequest, NextResponse } from 'next/server';
import { getServerLogBuffer } from '@/lib/logBuffer';

interface LogEntryResponse {
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: 'server' | 'client';
  message: string;
  meta?: unknown;
}

/**
 * GET /api/logs?sinceTs=...
 * Returns buffered Next.js server logs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sinceTsRaw = searchParams.get('sinceTs');
  const sinceTs = sinceTsRaw ? Number(sinceTsRaw) : undefined;

  const entries = getServerLogBuffer().snapshot({
    sinceTs: Number.isFinite(sinceTs) ? sinceTs : undefined,
  });

  return NextResponse.json({ entries: entries as LogEntryResponse[] });
}

export async function DELETE() {
  getServerLogBuffer().clear();
  return NextResponse.json({ ok: true });
}
