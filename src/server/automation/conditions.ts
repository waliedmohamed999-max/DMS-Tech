import { z } from "zod";
import { invalid } from "../errors";
import { FIELDS, type EntityKind, type FieldDef } from "./catalog";

/**
 * Condition language (docs/AUTOMATION.md#conditions) — data, not code:
 *   group = { all: [node…] } | { any: [node…] }       (AND / OR, nesting ≤ 3 levels, ≤ 20 leaves)
 *   leaf  = { field, op, value? }                     (field from the trigger's catalog; op allowed for the field type)
 * An empty `{ all: [] }` always matches. Evaluation is pure: same input → same result.
 */
export const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "is_set", "is_empty"] as const;
export type Op = (typeof OPS)[number];
const OPS_BY_TYPE: Record<FieldDef["type"], readonly Op[]> = {
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_set", "is_empty"],
  string: ["eq", "neq", "in", "not_in", "contains", "is_set", "is_empty"],
  enum: ["eq", "neq", "in", "not_in", "is_set", "is_empty"],
  boolean: ["eq", "neq"]
};

type Scalar = string | number | boolean;
export type Leaf = { field: string; op: Op; value?: Scalar | Scalar[] };
export type Group = { all: Node[] } | { any: Node[] };
export type Node = Leaf | Group;

const scalar = z.union([z.string().max(200), z.number().finite(), z.boolean()]);
const leafSchema = z.object({ field: z.string().max(80), op: z.enum(OPS), value: z.union([scalar, z.array(scalar).max(50)]).optional() }).strict();
const nodeSchema: z.ZodType<Node> = z.lazy(() => z.union([leafSchema, z.object({ all: z.array(nodeSchema).max(20) }).strict(), z.object({ any: z.array(nodeSchema).max(20) }).strict()]));

const isGroup = (n: Node): n is Group => "all" in n || "any" in n;
const children = (g: Group) => ("all" in g ? g.all : g.any);

/** Parse + validate against the trigger entity's field catalog. Throws VALIDATION with a precise code. */
export function validateConditions(raw: unknown, kind: EntityKind): Group {
  const parsed = nodeSchema.safeParse(raw ?? { all: [] });
  if (!parsed.success) throw invalid("CONDITION_INVALID:shape");
  const root = parsed.data;
  if (!isGroup(root)) throw invalid("CONDITION_INVALID:root_must_be_group");
  const fields = new Map(FIELDS[kind].map((f) => [f.name, f]));
  let leaves = 0;
  const walk = (n: Node, depth: number) => {
    if (depth > 3) throw invalid("CONDITION_INVALID:too_deep");
    if (isGroup(n)) return children(n).forEach((c) => walk(c, depth + 1));
    if (++leaves > 20) throw invalid("CONDITION_INVALID:too_many");
    const f = fields.get(n.field);
    if (!f) throw invalid(`CONDITION_INVALID:unknown_field:${n.field}`);
    if (!OPS_BY_TYPE[f.type].includes(n.op)) throw invalid(`CONDITION_INVALID:op:${n.field}:${n.op}`);
    if (n.op === "is_set" || n.op === "is_empty") return;
    if (n.value === undefined) throw invalid(`CONDITION_INVALID:value:${n.field}`);
    const vals = Array.isArray(n.value) ? n.value : [n.value];
    if ((n.op === "in" || n.op === "not_in") !== Array.isArray(n.value)) throw invalid(`CONDITION_INVALID:value:${n.field}`);
    for (const v of vals) {
      if (f.type === "number" && typeof v !== "number") throw invalid(`CONDITION_INVALID:number:${n.field}`);
      if (f.type === "boolean" && typeof v !== "boolean") throw invalid(`CONDITION_INVALID:boolean:${n.field}`);
      if ((f.type === "string" || f.type === "enum") && typeof v !== "string") throw invalid(`CONDITION_INVALID:string:${n.field}`);
      if (f.type === "enum" && f.options && !f.options.includes(v as string)) throw invalid(`CONDITION_INVALID:option:${n.field}:${v}`);
    }
  };
  walk(root, 1);
  return root;
}

const cmp = (a: unknown, b: unknown) => (typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Pure evaluation. A missing value (null) never satisfies a comparison except is_empty / neq. */
export function evaluate(node: Node, values: Record<string, unknown>): boolean {
  if (isGroup(node)) return "all" in node ? node.all.every((c) => evaluate(c, values)) : node.any.some((c) => evaluate(c, values));
  const v = values[node.field];
  const empty = v === null || v === undefined || v === "";
  switch (node.op) {
    case "is_set":
      return !empty;
    case "is_empty":
      return empty;
    case "eq":
      return !empty && cmp(v, node.value);
    case "neq":
      return empty || !cmp(v, node.value);
    case "gt":
      return !empty && Number(v) > Number(node.value);
    case "gte":
      return !empty && Number(v) >= Number(node.value);
    case "lt":
      return !empty && Number(v) < Number(node.value);
    case "lte":
      return !empty && Number(v) <= Number(node.value);
    case "in":
      return !empty && (node.value as Scalar[]).some((x) => cmp(v, x));
    case "not_in":
      return empty || !(node.value as Scalar[]).some((x) => cmp(v, x));
    case "contains":
      return !empty && String(v).toLowerCase().includes(String(node.value).toLowerCase());
  }
}

/** Leaves of a tree (for display). */
export function leavesOf(n: Node): Leaf[] {
  return isGroup(n) ? children(n).flatMap(leavesOf) : [n];
}
