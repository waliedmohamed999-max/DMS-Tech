/** Outbound HTTP for adapters: timeout, and a classification the outbox uses for retry decisions. */

export class IntegrationError extends Error {
  constructor(
    public code: string,
    message: string,
    /** network / 429 / 5xx → retry with backoff; other 4xx / config errors → dead-letter at once */
    public retryable: boolean,
    public status?: number
  ) {
    super(message);
  }
}

export async function httpJson<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; body: T }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10_000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal, redirect: "error" });
  } catch (e) {
    throw new IntegrationError("NETWORK_ERROR", (e as Error).name === "AbortError" ? "timeout" : (e as Error).message, true);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const providerCode = (body as { error?: { code?: number | string; message?: string } })?.error;
    throw new IntegrationError(
      res.status === 401 || res.status === 403 ? "AUTH_FAILED" : res.status === 429 ? "RATE_LIMITED" : res.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED",
      `HTTP ${res.status}${providerCode?.code ? ` (${providerCode.code})` : ""}: ${providerCode?.message ?? text.slice(0, 200)}`,
      res.status === 429 || res.status >= 500,
      res.status
    );
  }
  return { status: res.status, body: body as T };
}
