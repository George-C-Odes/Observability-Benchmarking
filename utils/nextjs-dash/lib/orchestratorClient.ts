/**
 * Shared HTTP client for communicating with the Quarkus orchestrator service.
 * Provides reusable methods for common operations following DRY principle.
 */

import { orchestratorConfig } from './config';

/**
 * TypeScript interfaces for type safety
 */
export interface JobStatus {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  lastLine?: string;
  output?: string;
  error?: string;
}

export interface CommandPreset {
  title: string;
  command: string;
  category: string;
  sourceFile: string;
}

export interface EnvFileContent {
  content: string;
}

/**
 * Base headers for orchestrator requests
 */
const getHeaders = (includeAuth: boolean = false): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  if (includeAuth) {
    headers['Authorization'] = `Bearer ${orchestratorConfig.apiKey}`;
  }
  
  return headers;
};

/**
 * Make a GET request to the orchestrator
 */
export async function orchestratorGet<T = unknown>(
  endpoint: string,
  requireAuth: boolean = false
): Promise<T> {
  const url = `${orchestratorConfig.url}${endpoint}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(requireAuth),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Orchestrator GET ${endpoint} failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Make a POST request to the orchestrator
 */
export async function orchestratorPost<T = unknown>(
  endpoint: string,
  body: unknown,
  requireAuth: boolean = true
): Promise<T> {
  const url = `${orchestratorConfig.url}${endpoint}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(requireAuth),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Orchestrator POST ${endpoint} failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Submit a command for execution
 */
export async function submitCommand(command: string): Promise<{ jobId: string }> {
  return orchestratorPost('/v1/run', { command });
}

/**
 * Get job status by jobId
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return orchestratorGet<JobStatus>(`/v1/jobs/${jobId}`, false);
}

/**
 * Get command presets from the orchestrator
 */
export async function getCommandPresets(): Promise<CommandPreset[]> {
  return orchestratorGet<CommandPreset[]>('/v1/commands', false);
}

/**
 * Get environment file content
 */
export async function getEnvFile(): Promise<EnvFileContent> {
  return orchestratorGet<EnvFileContent>('/v1/env', false);
}

/**
 * Update environment file content
 */
export async function updateEnvFile(content: string): Promise<void> {
  await orchestratorPost('/v1/env', { content });
}

/**
 * @deprecated Validation should live in the Quarkus orchestrator. Kept only as a very small
 * safety net to avoid sending obviously invalid requests.
 */
export function validateCommand(command: unknown): string {
  if (typeof command !== 'string') {
    throw new Error('Command must be a string');
  }
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('Command must be a non-empty string');
  }
  return trimmed;
}

/**
 * @deprecated Validation should live in the Quarkus orchestrator. Kept only as a very small
 * safety net to avoid sending obviously invalid requests.
 */
export function validateJobId(jobId: unknown): string {
  if (typeof jobId !== 'string') {
    throw new Error('jobId must be a string');
  }
  const trimmed = jobId.trim();
  if (!trimmed) {
    throw new Error('jobId must be a non-empty string');
  }
  return trimmed;
}
