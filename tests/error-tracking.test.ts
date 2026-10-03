import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { runWithObs } from "@/server/obs/context";
import { apiErrorBody, errorReporterStatus, reportError, setErrorReporter, type ErrorReporter } from "@/server/obs/errors";
import { configureObservability, deliver, normalizeStack, reporterDeliveryStats, resetReporterDeliveryStats, sentryReporter, webhookReporter } from "@/server/obs/reporters";
import { setLogSink } from "@/server/obs/log";
import { validateConfig } from "@/server/system/config";
import { conflict } from "@/server/errors";

/** Phase 11 (P11-D) — error-tracking production boundary, exercised against a LOCAL HTTP receiver (not a fake Sentry). */
type Hit = { url: string; headers: http.IncomingHttpHeaders; body: string };
let hits: Hit[] = [];
let plan: { status: number; delay?: number; headers?: Record<string, string> }[] = [];
let srv: http.Server;
let base = "";
beforeAll(async () => {
  srv = http.createServer((q, s) => {
    let body = "";
    q.on("data", (c) => (body += c));
    q.on("end", () => {
      hits.push({ url: q.url ?? "", headers: q.headers, body });
      const p = plan.shift() ?? { status: 200 };
      setTimeout(() => s.writeHead(p.status, p.headers ?? {}).end("{}"), p.delay ?? 0);
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(async () => {
  srv.closeAllConnections();
  await new Promise<void>((r) => srv.close(() => r()));
});
const logs: string[] = [];
beforeEach(() => {
  hits = [];
  plan = [];
  logs.length = 0;
  resetReporterDeliveryStats();
  setLogSink((l) => logs.push(l), true);
});
afterEach(async () => {
  setErrorReporter(null);
  setLogSink(null);
  await new Promise((r) => setTimeout(r, 30));
});
const until = async (fn: () => boolean, ms = 5000) => {
  const t = Date.now();
  while (!fn() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 10));
};
const fast = { delivery: { timeoutMs: 300, retryDelayMs: 20 } };

const SENSITIVE = {
  headers: { cookie: "__Host-dms_os=SESSIONTOKEN123456", authorization: "Bearer abcdefghijklmnopqrstu", "x-api-key": "APIKEY-998877" },
  employee: { iban: "SA0380000000608010167519", baseSalary: 18250, netPay: 15111, nationalId: "1098765432" },
  payment: { password: "hunter2-pass", signingSecret: "whsec_supersecret" },
  invoiceBody: "raw document body"
};
const LEAKS = ["SESSIONTOKEN123456", "abcdefghijklmnopqrstu", "APIKEY-998877", "SA0380000000608010167519", "18250", "15111", "1098765432", "hunter2-pass", "whsec_supersecret", "raw document body"];

describe("Sentry envelope", () => {
  it("carries environment, release, build, process, request + correlation ids and normalized frames — and nothing sensitive", async () => {
    setErrorReporter(sentryReporter(`${base.replace("http://", "http://publickey@")}/42`, fast));
    expect(errorReporterStatus()).toMatchObject({ name: "sentry", configured: true });
    const ref = runWithObs({ requestId: "req-p11-1", correlationId: "corr-p11-1", module: "finance" }, () =>
      reportError(new Error("payment failed password=hunter2-pass for SA0380000000608010167519 Bearer abcdefghijklmnopqrstu"), "finance.pay", SENSITIVE)
    );
    expect(ref).toBe("req-p11-1");
    await until(() => hits.length === 1);
    expect(hits[0].url).toBe("/api/42/envelope/");
    expect(hits[0].headers["x-sentry-auth"]).toMatch(/sentry_key=publickey/);
    const [, , ev] = hits[0].body.trim().split("\n").map((l) => JSON.parse(l));
    expect(ev.environment).toBe("test");
    expect(ev.release).toMatch(/^dms-os@\d+\.\d+\.\d+/);
    expect(ev.tags).toMatchObject({ ref: "req-p11-1", correlation_id: "corr-p11-1", where: "finance.pay", process: "web", module: "finance", category: "INTERNAL_ERROR" });
    const frames = ev.exception.values[0].stacktrace.frames as { filename?: string; lineno?: number; in_app: boolean }[];
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.filename?.startsWith("tests/error-tracking.test.ts") && f.in_app)).toBe(true);
    expect(JSON.stringify(frames)).not.toContain(process.cwd().replace(/\\/g, "/"));
    for (const s of LEAKS) expect(hits[0].body).not.toContain(s);
    await until(() => reporterDeliveryStats().sent === 1);
    expect(reporterDeliveryStats()).toMatchObject({ sent: 1, failed: 0 });
  });
});

describe("webhook reporter", () => {
  it("same context and redaction; bearer token sent only in the Authorization header", async () => {
    setErrorReporter(webhookReporter(`${base}/hook`, "hook-token", fast));
    runWithObs({ requestId: "req-hook-2", correlationId: "corr-hook-2" }, () => reportError(new Error("db exploded"), "test", SENSITIVE));
    await until(() => hits.length === 1);
    const p = JSON.parse(hits[0].body);
    expect(p).toMatchObject({ ref: "req-hook-2", requestId: "req-hook-2", correlationId: "corr-hook-2", environment: "test", process: "web", category: "INTERNAL_ERROR" });
    expect(hits[0].headers.authorization).toBe("Bearer hook-token");
    expect(hits[0].body).not.toContain("hook-token");
    for (const s of LEAKS) expect(hits[0].body).not.toContain(s);
  });
});

describe("delivery failures never touch the original request", () => {
  it("5xx → one retry → delivered", async () => {
    plan = [{ status: 503 }, { status: 200 }];
    expect(await deliver(fetch, `${base}/x`, { method: "POST", body: "{}" }, fast.delivery)).toBe("sent");
    expect(hits).toHaveLength(2);
    expect(reporterDeliveryStats()).toMatchObject({ sent: 1, retried: 1 });
  });

  it("4xx → dropped without retry (counted)", async () => {
    plan = [{ status: 400 }];
    expect(await deliver(fetch, `${base}/x`, { method: "POST", body: "{}" }, fast.delivery)).toBe("failed");
    expect(hits).toHaveLength(1);
    expect(reporterDeliveryStats()).toMatchObject({ failed: 1, lastError: "HTTP_400" });
  });

  it("429 → Retry-After honoured: later events are dropped until the window passes", async () => {
    plan = [{ status: 429, headers: { "retry-after": "1" } }];
    expect(await deliver(fetch, `${base}/x`, { method: "POST", body: "{}" }, fast.delivery)).toBe("failed");
    expect(await deliver(fetch, `${base}/x`, { method: "POST", body: "{}" }, fast.delivery)).toBe("dropped");
    expect(hits).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await deliver(fetch, `${base}/x`, { method: "POST", body: "{}" }, fast.delivery)).toBe("sent");
  });

  it("timeout → retried once → failed (TIMEOUT)", async () => {
    plan = [{ status: 200, delay: 1000 }, { status: 200, delay: 1000 }];
    expect(await deliver(fetch, `${base}/slow`, { method: "POST", body: "{}" }, fast.delivery)).toBe("failed");
    expect(reporterDeliveryStats()).toMatchObject({ failed: 1, retried: 1, lastError: "TIMEOUT" });
  });

  it("tracker unavailable: reportError returns the reference immediately and the error is still logged", async () => {
    setErrorReporter(webhookReporter("http://127.0.0.1:9/unreachable", undefined, fast));
    const t0 = Date.now();
    const ref = runWithObs({ requestId: "req-down-1" }, () => reportError(new Error("boom"), "test"));
    expect(Date.now() - t0).toBeLessThan(50);
    expect(ref).toBe("req-down-1");
    expect(logs.some((l) => l.includes('"unhandled_error"') && l.includes("req-down-1"))).toBe(true);
    await until(() => reporterDeliveryStats().failed === 1);
    expect(reporterDeliveryStats().lastError).toBe("NETWORK");
  });

  it("a reporter that throws synchronously cannot break reportError", () => {
    const broken: ErrorReporter = { name: "broken", configured: true, capture() { throw new Error("reporter bug"); } };
    setErrorReporter(broken);
    expect(runWithObs({ requestId: "req-broken" }, () => reportError(new Error("x"), "test"))).toBe("req-broken");
  });

  it("in-flight cap: a hanging tracker cannot accumulate unbounded work", async () => {
    plan = Array.from({ length: 30 }, () => ({ status: 200, delay: 400 }));
    const res = await Promise.all(Array.from({ length: 25 }, () => deliver(fetch, `${base}/x`, { method: "POST", body: "{}" }, { timeoutMs: 2000, retryDelayMs: 10 })));
    expect(res.filter((r) => r === "dropped").length).toBe(5);
  });
});

describe("what is reported", () => {
  it("expected (business) errors are not sent to the tracker; unexpected ones are", async () => {
    setErrorReporter(webhookReporter(`${base}/hook`, undefined, fast));
    runWithObs({ requestId: "req-exp" }, () => apiErrorBody(conflict("INVOICE_ALREADY_PAID"), "test"));
    runWithObs({ requestId: "req-unexp" }, () => apiErrorBody(new TypeError("x is undefined"), "test"));
    await until(() => hits.length === 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(hits).toHaveLength(1);
    expect(JSON.parse(hits[0].body).ref).toBe("req-unexp");
  });

  it("sampling: rate 0 sends nothing (still logged); invalid rates are refused by config validation", async () => {
    configureObservability({ ERROR_REPORT_WEBHOOK_URL: `${base}/hook`, ERROR_REPORT_SAMPLE_RATE: "0" });
    reportError(new Error("sampled out"), "test");
    await new Promise((r) => setTimeout(r, 50));
    expect(hits).toHaveLength(0);
    expect(reporterDeliveryStats().sampledOut).toBe(1);
    const issues = (env: Record<string, string>) => validateConfig({ DATABASE_URL: "postgresql://a/b", ...env }).issues.map((i) => `${i.key}:${i.code}`);
    expect(issues({ ERROR_REPORT_SAMPLE_RATE: "1.5" })).toContain("ERROR_REPORT_SAMPLE_RATE:INVALID");
    expect(issues({ ERROR_REPORT_SAMPLE_RATE: "0" })).toContain("ERROR_REPORT_SAMPLE_RATE:ZERO_NOTHING_REPORTED");
    expect(issues({ NODE_ENV: "production", ERROR_REPORT_WEBHOOK_URL: "http://alerts.example" })).toContain("ERROR_REPORT_WEBHOOK_URL:HTTPS_REQUIRED");
  });

  it("worker path: events from the worker are tagged process=worker with the job", async () => {
    configureObservability({ SENTRY_DSN: `${base.replace("http://", "http://k@")}/7` }, "worker");
    runWithObs({ module: "worker", job: "worker" }, () => reportError(new Error("sweep failed"), "worker:hr"));
    await until(() => hits.length === 1);
    const ev = JSON.parse(hits[0].body.trim().split("\n")[2]);
    expect(ev.tags).toMatchObject({ process: "worker", where: "worker:hr" });
  });

  it("stack normalization strips absolute machine paths and marks dependency frames", () => {
    const root = "C:\\srv\\dms";
    const frames = normalizeStack(["Error: x", "    at pay (C:\\srv\\dms\\src\\server\\finance\\payments.ts:12:5)", "    at async run (C:\\srv\\dms\\node_modules\\pg\\lib\\client.js:1:2)", "    at /home/alice/secret-project/x.js:3:4", "    at node:internal/process:5:6"].join("\n"), root);
    expect(frames[0]).toEqual({ function: "pay", filename: "src/server/finance/payments.ts", lineno: 12, colno: 5, in_app: true });
    expect(frames[1]).toMatchObject({ filename: "node_modules/pg/lib/client.js", in_app: false });
    expect(frames[2].filename).toBe("alice/secret-project/x.js".split("/").slice(-3).join("/"));
    expect(frames[3]).toMatchObject({ filename: "node:internal/process", in_app: false });
  });
});
