/**
 * Request bodies with a hard size cap. A Content-Length header can be left out (chunked upload), so the declared size
 * alone is not enough: the stream is cut off as soon as it passes the cap, before it is held in memory.
 */

/** The raw body, or null when it is larger than `max` bytes. */
export async function cappedBody(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * multipart/form-data with a size cap: "too_large" past the cap, "bad_form" when it is not a well-formed multipart body.
 */
export async function cappedFormData(request: Request, max: number): Promise<FormData | "too_large" | "bad_form"> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;/i.test(type)) return "bad_form";
  const body = await cappedBody(request, max).catch(() => null);
  if (!body) return "too_large";
  try {
    return await new Response(body as BodyInit, { headers: { "content-type": type } }).formData();
  } catch {
    return "bad_form";
  }
}
