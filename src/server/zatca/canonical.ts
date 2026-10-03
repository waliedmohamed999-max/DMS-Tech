import { createHash } from "node:crypto";

/**
 * Deterministic XML for ZATCA documents.
 *
 * [XML] BR-KSA-26 / [GUIDE] §5.2 step 1: the invoice hash is SHA-256 over the document canonicalized with C14N 1.1
 * after removing ext:UBLExtensions, cac:Signature and the AdditionalDocumentReference with ID "QR", without the XML
 * declaration, base64-encoded.
 *
 * Instead of parsing and re-canonicalizing text, documents are built as a tree and SERIALIZED DIRECTLY IN CANONICAL
 * FORM (no insignificant whitespace, attributes / namespace declarations in canonical order, start + end tags for
 * empty elements, canonical character escaping, LF only). For such a document C14N is the identity, so the bytes we
 * hash are exactly the bytes a C14N 1.1 implementation (ZATCA validator / SDK) produces from the stored XML.
 * The "hash view" omits the three excluded nodes — equivalent to the official XPath transforms on a document that
 * carries no whitespace text nodes around them. Verification against the official SDK: scripts/zatca-sdk-validate.ts.
 */
export type XNode = { name: string; attrs?: Record<string, string>; children?: (XNode | string)[] };

export const el = (name: string, a?: Record<string, string> | (XNode | string | null | undefined | false)[] | string, c?: (XNode | string | null | undefined | false)[] | string): XNode => {
  const attrs = a && !Array.isArray(a) && typeof a === "object" ? a : undefined;
  const raw = (attrs ? c : a) as (XNode | string | null | undefined | false)[] | string | undefined;
  const children = raw === undefined ? [] : typeof raw === "string" ? [raw] : raw.filter((x): x is XNode | string => x !== null && x !== undefined && x !== false);
  return { name, attrs, children };
};

// C14N character escaping (W3C Canonical XML 1.1 §2.3 / 1.0 §2.3)
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

/** Text content normalization before serialization: no CR, no control characters XML 1.0 forbids. */
export const cleanText = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

/**
 * Canonical attribute order: namespace declarations first (default namespace, then by prefix), then ordinary
 * attributes by (namespace URI, local name). Our ordinary attributes are unprefixed (namespace URI ""), so they sort by name.
 */
function attrString(attrs: Record<string, string> | undefined) {
  if (!attrs) return "";
  const keys = Object.keys(attrs);
  // namespace nodes by local name (the prefix) in code-point order; the default namespace (empty local name) first
  const ns = keys.filter((k) => k === "xmlns" || k.startsWith("xmlns:")).sort((a, b) => (a === "xmlns" ? -1 : b === "xmlns" ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const plain = keys.filter((k) => !(k === "xmlns" || k.startsWith("xmlns:"))).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (plain.some((k) => k.includes(":"))) throw new Error("prefixed attributes are not used in ZATCA documents (canonical order would need namespace URIs)");
  return [...ns, ...plain].map((k) => ` ${k}="${escAttr(attrs[k])}"`).join("");
}

export type SerializeOpts = { omit?: (n: XNode) => boolean };
export function serialize(n: XNode, opts: SerializeOpts = {}): string {
  if (opts.omit?.(n)) return "";
  const inner = (n.children ?? []).map((c) => (typeof c === "string" ? escText(cleanText(c)) : serialize(c, opts))).join("");
  return `<${n.name}${attrString(n.attrs)}>${inner}</${n.name}>`;
}

/** Nodes excluded from the invoice hash ([SEC] §2.3.3 transforms / [XML] BR-KSA-26). */
export const excludedFromHash = (n: XNode) =>
  n.name === "ext:UBLExtensions" || n.name === "cac:Signature" || (n.name === "cac:AdditionalDocumentReference" && (n.children ?? []).some((c) => typeof c !== "string" && c.name === "cbc:ID" && (c.children ?? []).join("").trim() === "QR"));

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** The stored / submitted document. */
export const documentXml = (root: XNode) => XML_DECLARATION + serialize(root);
/** Canonical hash input (C14N view without the excluded nodes and without the XML declaration). */
export const hashView = (root: XNode) => serialize(root, { omit: excludedFromHash });
/** base64(SHA-256(canonical bytes)) — [GUIDE] §5.2 step 1 (digest bytes, base64). */
export const invoiceHashOf = (canonical: string) => createHash("sha256").update(canonical, "utf8").digest("base64");
