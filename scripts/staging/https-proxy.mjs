// LOCAL STAGING REHEARSAL — TLS edge in front of two app instances (what nginx does in deploy/nginx/dms-os.conf):
//   https://staging.127.0.0.1.nip.io:8443  → round-robin to 127.0.0.1:3200 / :3201 (skips an instance that is down)
//   http://staging.127.0.0.1.nip.io:8080   → 301 to https
// X-Forwarded-For / -Proto / -Host are OVERWRITTEN (never appended) and every request gets an X-Request-Id.
//   node scripts/staging/https-proxy.mjs
import https from "node:https";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const tls = path.resolve(".local/staging/tls");
const upstreams = (process.env.UPSTREAMS ?? "3200,3201").split(",").map(Number);
const down = new Map();
let rr = 0;

function pick() {
  for (let i = 0; i < upstreams.length; i++) {
    const p = upstreams[rr++ % upstreams.length];
    if ((down.get(p) ?? 0) < Date.now()) return p;
  }
  return upstreams[0];
}

function forward(req, res, attempt = 0) {
  const port = pick();
  const headers = { ...req.headers, "x-forwarded-for": req.socket.remoteAddress?.replace("::ffff:", "") ?? "", "x-forwarded-proto": "https", "x-forwarded-host": req.headers.host, "x-real-ip": req.socket.remoteAddress?.replace("::ffff:", "") ?? "" };
  if (!headers["x-request-id"]) headers["x-request-id"] = randomUUID();
  const up = http.request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => {
    down.set(port, Date.now() + 5000);
    // retry idempotent requests once on the other instance (never replay a body we already streamed)
    if (attempt === 0 && (req.method === "GET" || req.method === "HEAD")) return forward(req, res, 1);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("bad gateway");
  });
  req.pipe(up);
}

https.createServer({ key: readFileSync(path.join(tls, "web.key")), cert: readFileSync(path.join(tls, "web.crt")) }, forward).listen(8443, () => console.log(`[https-proxy] https://staging.127.0.0.1.nip.io:8443 → ${upstreams.join(", ")}`));
http.createServer((req, res) => {
  res.writeHead(301, { location: `https://${(req.headers.host ?? "staging.127.0.0.1.nip.io").replace(/:8080$/, ":8443")}${req.url}` });
  res.end();
}).listen(8080, () => console.log("[https-proxy] http://…:8080 → 301 https"));
