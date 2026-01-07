/**
 * Shared HTTP client for communicating with the Quarkus orchestrator service.
 * Provides reusable methods for common operations following DRY principle.
 */

import { orchestratorConfig } from './config';

/**
 * Base headers for orchestrator requests
 */
const getHeaders = (includeAuth: boolean = true): HeadersInit => {
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
export async function orchestratorGet<T = any>(
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
export async function orchestratorPost<T = any>(
  endpoint: string,
  body: any,
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
export async function getJobStatus(jobId: string): Promise<any> {
  return orchestratorGet(`/v1/jobs/${jobId}`, false);
}

/**
 * Get command presets from the orchestrator
 */
export async function getCommandPresets(): Promise<any> {
  return orchestratorGet('/v1/commands', false);
}

/**
 * Get environment file content
 */
export async function getEnvFile(): Promise<{ content: string }> {
  return orchestratorGet('/v1/env', false);
}

/**
 * Update environment file content
 */
export async function updateEnvFile(content: string): Promise<void> {
  await orchestratorPost('/v1/env', { content });
}

/**
 * Validate that a command string is not empty
 */
export function validateCommand(command: unknown): string {
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('Command is required and must be a non-empty string');
  }
  return command.trim();
}

/**
 * Validate that a jobId is valid
 */
export function validateJobId(jobId: unknown): string {
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('jobId is required and must be a non-empty string');
  }
  return jobId.trim();
}
