import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  error: string;
  details?: string;
  [key: string]: unknown;
}

export function okJson<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: init?.headers });
}

export function errorJson(
  status: number,
  body: ApiErrorBody,
  init?: { headers?: HeadersInit }
) {
  return NextResponse.json(body, { status, headers: init?.headers });
}

export function errorFromUnknown(status: number, error: unknown, fallbackMessage: string) {
  const details = error instanceof Error ? error.message : String(error);
  return errorJson(status, { error: fallbackMessage, details });
}