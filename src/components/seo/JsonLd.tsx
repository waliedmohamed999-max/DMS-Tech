/**
 * Structured data (schema.org JSON-LD), emitted exactly like /offers does. A `type="application/ld+json"` block is
 * data, never executed: the public CSP needs no hash or nonce for it, and scripts/csp-manifest.mjs skips it.
 * `<` is escaped so no text in the data can close the script element.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
