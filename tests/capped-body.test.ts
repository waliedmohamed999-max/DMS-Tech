import { describe, expect, it } from "vitest";
import { cappedBody, cappedFormData } from "@/lib/capped-body";

/** A request whose body arrives in chunks without a Content-Length header (what a chunked upload looks like). */
function chunked(parts: Uint8Array[], type = "application/octet-stream") {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    }
  });
  return new Request("http://localhost/x", { method: "POST", body: stream, headers: { "content-type": type }, duplex: "half" } as RequestInit);
}

describe("capped request bodies", () => {
  it("cuts off a chunked body that passes the cap even without Content-Length", async () => {
    const r = chunked([new Uint8Array(600), new Uint8Array(600)]);
    expect(r.headers.get("content-length")).toBeNull();
    expect(await cappedBody(r, 1000)).toBeNull();
  });

  it("refuses a declared size above the cap before reading", async () => {
    const r = new Request("http://localhost/x", { method: "POST", body: "x", headers: { "content-length": "5000" } });
    expect(await cappedBody(r, 1000)).toBeNull();
  });

  it("returns the whole body when it fits", async () => {
    const r = chunked([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect(Array.from((await cappedBody(r, 10))!)).toEqual([1, 2, 3]);
  });

  it("parses multipart within the cap and rejects other content types", async () => {
    const fd = new FormData();
    fd.set("name", "test");
    const ok = await cappedFormData(new Request("http://localhost/x", { method: "POST", body: fd }), 10_000);
    expect(ok instanceof FormData && ok.get("name")).toBe("test");
    expect(await cappedFormData(new Request("http://localhost/x", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), 10_000)).toBe("bad_form");
    const big = new FormData();
    big.set("f", new Blob([new Uint8Array(20_000)]), "a.pdf");
    expect(await cappedFormData(new Request("http://localhost/x", { method: "POST", body: big }), 10_000)).toBe("too_large");
  });
});
