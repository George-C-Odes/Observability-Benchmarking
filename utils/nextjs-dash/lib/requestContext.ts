import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type RequestContext = {
  requestId: string;
};

const als = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(fn: () => T, requestId?: string): T {
  const ctx: RequestContext = { requestId: requestId ?? randomUUID() };
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

