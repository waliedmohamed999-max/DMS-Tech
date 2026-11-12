import { describe, expect, it } from "vitest";
import { dbPoolConfig, validateConfig } from "@/server/system/config";

const base = { DATABASE_URL: "postgresql://a/b" };
const poolIssues = (env: Record<string, string>) =>
  validateConfig({ ...base, ...env })
    .issues.filter((i) => i.key.startsWith("DB_"))
    .map((i) => `${i.key}:${i.code}:${i.level}`);

describe("dbPoolConfig (optional pg pool limits)", () => {
  it("unset or empty → no keys, so pg defaults apply exactly as before", () => {
    expect(dbPoolConfig({})).toEqual({ config: {}, invalid: [] });
    expect(dbPoolConfig({ DB_POOL_MAX: "", DB_POOL_IDLE_TIMEOUT_MS: "  ", DB_CONNECTION_TIMEOUT_MS: "" })).toEqual({ config: {}, invalid: [] });
    expect(poolIssues({})).toEqual([]);
  });

  it("maps valid values onto pg PoolConfig fields", () => {
    expect(dbPoolConfig({ DB_POOL_MAX: "5", DB_POOL_IDLE_TIMEOUT_MS: "10000", DB_CONNECTION_TIMEOUT_MS: " 10000 " }).config).toEqual({ max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    // 0 is pg's "disabled" for both timeouts
    expect(dbPoolConfig({ DB_POOL_IDLE_TIMEOUT_MS: "0", DB_CONNECTION_TIMEOUT_MS: "0" }).config).toEqual({ idleTimeoutMillis: 0, connectionTimeoutMillis: 0 });
    expect(poolIssues({ DB_POOL_MAX: "3" })).toEqual([]);
  });

  it("invalid values are ignored by the pool and reported as critical by validateConfig", () => {
    const r = dbPoolConfig({ DB_POOL_MAX: "0", DB_POOL_IDLE_TIMEOUT_MS: "-1", DB_CONNECTION_TIMEOUT_MS: "5s" });
    expect(r.config).toEqual({});
    expect(r.invalid).toEqual(["DB_POOL_MAX", "DB_POOL_IDLE_TIMEOUT_MS", "DB_CONNECTION_TIMEOUT_MS"]);
    expect(dbPoolConfig({ DB_POOL_MAX: "2.5" }).invalid).toEqual(["DB_POOL_MAX"]);
    expect(poolIssues({ DB_POOL_MAX: "ten" })).toEqual(["DB_POOL_MAX:INVALID:critical"]);
  });
});
