"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { useHrRun } from "@/components/hr/Forms";

/**
 * Structured rule builder: Trigger → Conditions (one AND / OR group of field / operator / value rows) → Actions.
 * The browser only assembles JSON; the server validates every field, operator, value and action against the catalog.
 */
type FieldDef = { name: string; type: "number" | "string" | "enum" | "boolean"; options?: readonly string[] };
type Opt = { value: string; label: string };
type Row = { field: string; op: string; value: string };
type ActionRow = Record<string, string> & { type: string };

const OPS: Record<FieldDef["type"], string[]> = {
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_set", "is_empty"],
  string: ["eq", "neq", "in", "not_in", "contains", "is_set", "is_empty"],
  enum: ["eq", "neq", "in", "not_in", "is_set", "is_empty"],
  boolean: ["eq", "neq"]
};

type Initial = { name?: string; description?: string | null; priority?: number; triggerEvent?: string; conditions?: unknown; actions?: unknown };
type AnyAction = (...args: never[]) => Promise<ActionResult<unknown>>;

function toRows(c: unknown): { mode: "all" | "any"; rows: Row[] } {
  const g = (c ?? { all: [] }) as { all?: unknown[]; any?: unknown[] };
  const mode = g.any ? "any" : "all";
  const list = (g.any ?? g.all ?? []) as { field?: string; op?: string; value?: unknown }[];
  return { mode, rows: list.filter((x) => x.field).map((x) => ({ field: x.field!, op: x.op ?? "eq", value: Array.isArray(x.value) ? x.value.join(", ") : x.value === undefined ? "" : String(x.value) })) };
}

export function RuleBuilder({
  action, args = [], initial, triggers, fields, permissions, users, connections, redirect, submitLabel
}: {
  action: AnyAction;
  args?: unknown[];
  initial?: Initial;
  triggers: { event: string; kind: string; label: string }[];
  fields: Record<string, FieldDef[]>;
  permissions: Opt[];
  users: Opt[];
  connections: Opt[];
  redirect?: string;
  submitLabel: string;
}) {
  const t = useTranslations("os.system");
  const router = useRouter();
  const { pending, error, run } = useHrRun();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState(String(initial?.priority ?? 100));
  const [trigger, setTrigger] = useState(initial?.triggerEvent ?? triggers[0]?.event ?? "");
  const init = toRows(initial?.conditions);
  const [mode, setMode] = useState<"all" | "any">(init.mode);
  const [rows, setRows] = useState<Row[]>(init.rows);
  const [acts, setActs] = useState<ActionRow[]>(((initial?.actions as Record<string, unknown>[] | undefined) ?? [{ type: "notify", to: "owner", priority: "MEDIUM", message: "" }]).map((a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) as ActionRow));
  const kind = triggers.find((x) => x.event === trigger)?.kind ?? "";
  const fieldDefs = useMemo(() => fields[kind] ?? [], [fields, kind]);

  const leaf = (r: Row) => {
    const f = fieldDefs.find((x) => x.name === r.field);
    if (!f) return { field: r.field, op: r.op };
    if (r.op === "is_set" || r.op === "is_empty") return { field: r.field, op: r.op };
    const conv = (v: string) => (f.type === "number" ? Number(v) : f.type === "boolean" ? v === "true" : v.trim());
    if (r.op === "in" || r.op === "not_in") return { field: r.field, op: r.op, value: r.value.split(",").map((x) => x.trim()).filter(Boolean).map(conv) };
    return { field: r.field, op: r.op, value: conv(r.value) };
  };
  const actionJson = (a: ActionRow) => {
    const o: Record<string, unknown> = { type: a.type };
    for (const [k, v] of Object.entries(a)) {
      if (k === "type" || v === "" || v === undefined) continue;
      o[k] = k === "inDays" ? Number(v) : v;
    }
    if (o.type === "notify" && o.to !== "permission") delete o.permission;
    if (o.type === "notify" && o.to !== "user") delete o.userId;
    return o;
  };
  const submit = () =>
    run(
      () => (action as (...a: unknown[]) => Promise<ActionResult<unknown>>)(...args, { name, description, priority, triggerEvent: trigger, conditions: JSON.stringify({ [mode]: rows.map(leaf) }), actions: JSON.stringify(acts.map(actionJson)) }),
      (r) => {
        const id = (r.ok && (r.data as { id?: string } | undefined)?.id) || null;
        if (redirect) router.push(redirect.replace(":id", id ?? ""));
      }
    );

  // a new action type starts from its own defaults (no leftover fields from the previous type — the server is strict)
  const fresh = (type: string): ActionRow =>
    type === "notify" ? { type, to: "owner", priority: "MEDIUM", message: "" } : type === "follow_up" ? { type, inDays: "0", title: "" } : type === "project_task" ? { type, title: "", inDays: "7", priority: "MEDIUM" } : type === "activity" ? { type, message: "" } : ({ type } as ActionRow);
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setAct = (i: number, patch: Partial<ActionRow>) => setActs(acts.map((a, j) => (j === i ? ({ ...a, ...patch } as ActionRow) : a)));
  const input = "os-input";

  return (
    <div className="grid gap-5">
      <section className="os-card grid gap-3 p-4 sm:grid-cols-2">
        <label className="grid sm:col-span-2">
          <span className="os-label">{t("f.name")} *</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid sm:col-span-2">
          <span className="os-label">{t("f.description")}</span>
          <input className={input} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="grid">
          <span className="os-label">{t("f.trigger")} *</span>
          <select className={input} value={trigger} onChange={(e) => { setTrigger(e.target.value); setRows([]); }}>
            {triggers.map((x) => (
              <option key={x.event} value={x.event}>{x.label}</option>
            ))}
          </select>
          <span className="mt-1 text-[11px] text-os-faint" dir="ltr">{trigger}</span>
        </label>
        <label className="grid">
          <span className="os-label">{t("f.priority")}</span>
          <input className={input} dir="ltr" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} />
          <span className="mt-1 text-[11px] text-os-faint">{t("priorityHint")}</span>
        </label>
      </section>

      <section className="os-card grid gap-3 p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("conditions")}</h2>
          <select className="os-input w-auto" value={mode} onChange={(e) => setMode(e.target.value as "all" | "any")} aria-label={t("conditions")}>
            <option value="all">{t("mode.all")}</option>
            <option value="any">{t("mode.any")}</option>
          </select>
        </header>
        {rows.length === 0 && <p className="text-xs text-os-muted">{t("noConditions")}</p>}
        {rows.map((r, i) => {
          const f = fieldDefs.find((x) => x.name === r.field);
          const ops = f ? OPS[f.type] : [];
          const noValue = r.op === "is_set" || r.op === "is_empty";
          return (
            <div key={i} className="grid gap-2 rounded-lg border border-os-line p-2 sm:grid-cols-[1.4fr_1fr_1.4fr_auto]">
              <select className={input} dir="ltr" value={r.field} onChange={(e) => setRow(i, { field: e.target.value, op: OPS[fieldDefs.find((x) => x.name === e.target.value)?.type ?? "string"][0], value: "" })} aria-label={t("f.field")}>
                <option value="">—</option>
                {fieldDefs.map((x) => (
                  <option key={x.name} value={x.name}>{x.name}</option>
                ))}
              </select>
              <select className={input} value={r.op} onChange={(e) => setRow(i, { op: e.target.value })} aria-label={t("f.op")}>
                {ops.map((o) => (
                  <option key={o} value={o}>{t(`op.${o}` as "op.eq")}</option>
                ))}
              </select>
              {noValue ? (
                <span />
              ) : f?.type === "boolean" ? (
                <select className={input} value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} aria-label={t("f.value")}>
                  <option value="">—</option>
                  <option value="true">{t("yes")}</option>
                  <option value="false">{t("no")}</option>
                </select>
              ) : f?.type === "enum" && r.op !== "in" && r.op !== "not_in" ? (
                <select className={input} dir="ltr" value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} aria-label={t("f.value")}>
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input className={input} dir="ltr" inputMode={f?.type === "number" ? "decimal" : undefined} placeholder={r.op === "in" || r.op === "not_in" ? "A, B, C" : ""} value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} aria-label={t("f.value")} />
              )}
              <button type="button" className="os-btn-ghost text-danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t("remove")}</button>
            </div>
          );
        })}
        <button type="button" className="os-btn-secondary w-fit" disabled={!fieldDefs.length || rows.length >= 20} onClick={() => setRows([...rows, { field: "", op: "eq", value: "" }])}>+ {t("addCondition")}</button>
      </section>

      <section className="os-card grid gap-3 p-4">
        <h2 className="font-semibold">{t("actions")}</h2>
        <p className="text-xs text-os-muted">{t("actionsNote")}</p>
        {acts.map((a, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-os-line p-2 sm:grid-cols-2">
            <select className={input} value={a.type} onChange={(e) => setActs(acts.map((x, j) => (j === i ? fresh(e.target.value) : x)))} aria-label={t("f.actionType")}>
              {["notify", "activity", "follow_up", "project_task", "assign_owner", "outbound_webhook"].map((x) => (
                <option key={x} value={x}>{t(`act.${x}` as "act.notify")}</option>
              ))}
            </select>
            <button type="button" className="os-btn-ghost w-fit text-danger justify-self-end" onClick={() => setActs(acts.filter((_, j) => j !== i))}>{t("remove")}</button>
            {a.type === "notify" && (
              <>
                <select className={input} value={a.to ?? "owner"} onChange={(e) => setAct(i, { to: e.target.value })} aria-label={t("f.recipients")}>
                  {["owner", "permission", "user"].map((x) => (
                    <option key={x} value={x}>{t(`to.${x}` as "to.owner")}</option>
                  ))}
                </select>
                {a.to === "permission" ? (
                  <select className={input} dir="ltr" value={a.permission ?? ""} onChange={(e) => setAct(i, { permission: e.target.value })} aria-label={t("f.permission")}>
                    <option value="">—</option>
                    {permissions.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                ) : a.to === "user" ? (
                  <select className={input} value={a.userId ?? ""} onChange={(e) => setAct(i, { userId: e.target.value })} aria-label={t("f.user")}>
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="self-center text-xs text-os-muted">{t("ownerHint")}</span>
                )}
                <select className={input} value={a.priority ?? "MEDIUM"} onChange={(e) => setAct(i, { priority: e.target.value })} aria-label={t("f.priority")}>
                  {["MEDIUM", "HIGH", "URGENT"].map((x) => (
                    <option key={x} value={x}>{t(`prio.${x}` as "prio.HIGH")}</option>
                  ))}
                </select>
                <input className={input} placeholder={t("f.message")} value={a.message ?? ""} onChange={(e) => setAct(i, { message: e.target.value })} aria-label={t("f.message")} />
              </>
            )}
            {a.type === "activity" && <input className={`${input} sm:col-span-2`} placeholder={t("f.message")} value={a.message ?? ""} onChange={(e) => setAct(i, { message: e.target.value })} aria-label={t("f.message")} />}
            {(a.type === "follow_up" || a.type === "project_task") && (
              <>
                <input className={input} placeholder={t("f.title")} value={a.title ?? ""} onChange={(e) => setAct(i, { title: e.target.value })} aria-label={t("f.title")} />
                <input className={input} dir="ltr" inputMode="numeric" placeholder={t("f.inDays")} value={a.inDays ?? ""} onChange={(e) => setAct(i, { inDays: e.target.value })} aria-label={t("f.inDays")} />
              </>
            )}
            {a.type === "assign_owner" && (
              <select className={`${input} sm:col-span-2`} value={a.userId ?? ""} onChange={(e) => setAct(i, { userId: e.target.value })} aria-label={t("f.user")}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            )}
            {a.type === "outbound_webhook" && (
              <select className={`${input} sm:col-span-2`} value={a.connectionId ?? ""} onChange={(e) => setAct(i, { connectionId: e.target.value })} aria-label={t("f.connection")}>
                <option value="">—</option>
                {connections.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            )}
          </div>
        ))}
        <button type="button" className="os-btn-secondary w-fit" disabled={acts.length >= 5} onClick={() => setActs([...acts, fresh("notify")])}>+ {t("addAction")}</button>
      </section>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="os-btn-primary" disabled={pending || !name.trim()} onClick={submit}>
          {pending ? "…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
