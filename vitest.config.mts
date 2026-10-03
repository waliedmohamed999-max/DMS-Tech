import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config();
// Tests always run against the dedicated test database, never DATABASE_URL.
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for tests");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// test-only field-encryption key (never a real secret); real environments set HR_FIELD_KEY in their secret manager
process.env.HR_FIELD_KEY = Buffer.alloc(32, 7).toString("base64");

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
