/** Print the configuration report (keys + codes only, never values). Exit 1 if a critical issue exists. */
import "dotenv/config";
import { validateConfig } from "../src/server/system/config";

const r = validateConfig();
console.log(JSON.stringify(r, null, 2));
if (!r.ok) process.exitCode = 1;
