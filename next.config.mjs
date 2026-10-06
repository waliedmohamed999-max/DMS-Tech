import createNextIntlPlugin from "next-intl/plugin";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headerRules } from "./security-headers.mjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// cPanel / CloudLinux Node.js Selector: node_modules is a symlink to ~/nodevenv/<app>/<ver>/lib/node_modules, OUTSIDE the
// project. Turbopack refuses a symlink that leaves its filesystem root ("Symlink [project]/node_modules is invalid, it
// points out of the filesystem root"), so in that layout — and only then — the root becomes the nearest common parent
// of the project and the real node_modules (e.g. /home/<user>). Everywhere else this is undefined = Next.js defaults.
function externalModulesRoot() {
  const projectDir = path.dirname(fileURLToPath(import.meta.url));
  let real;
  try {
    real = realpathSync(path.join(projectDir, "node_modules"));
  } catch {
    return undefined;
  }
  const rel = path.relative(projectDir, real);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return undefined;
  let common = projectDir;
  while (path.relative(common, real).startsWith("..")) common = path.dirname(common);
  return common;
}
const modulesRoot = externalModulesRoot();

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // must match each other (Next.js requirement) — see externalModulesRoot()
  ...(modulesRoot ? { turbopack: { root: modulesRoot }, outputFileTracingRoot: modulesRoot } : {}),
  // `next build` type-checks the app without the test suite: tests need devDependencies (vitest) that a production
  // install (cPanel, --omit=dev) does not have. `npm run typecheck` still checks everything, tests included.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // shared hosting (cPanel/CloudLinux LVE memory + process limits): cap build workers; unset = Next.js default
  ...(Number(process.env.NEXT_BUILD_CPUS) > 0 ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),
  // PDF generation reads bundled fonts + logo from disk at runtime (src/server/pdf/doc.ts);
  // make sure serverless/standalone traces ship them with every route that can render a PDF.
  outputFileTracingIncludes: {
    "/app/**": ["./assets/fonts/**/*", "./assets/brand/**/*"]
  },
  // pdfkit loads its standard font metrics from its own package directory at runtime
  serverExternalPackages: ["pdfkit"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }]
  },
  async headers() {
    // Phase 9: CSP + HSTS (production) + baseline headers — see security-headers.mjs
    return headerRules(process.env.NODE_ENV === "production");
  }
};

export default withNextIntl(nextConfig);
