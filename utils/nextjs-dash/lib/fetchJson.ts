export class HttpError extends Error {
  readonly status: number;
  readonly bodyText?: string;

  constructor(status: number, message: string, bodyText?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.bodyText = bodyText;
  }
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(res.status, `Request failed (${res.status})`, text);
  }
  return res.json() as Promise<T>;
}

