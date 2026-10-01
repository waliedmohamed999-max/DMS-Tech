import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
