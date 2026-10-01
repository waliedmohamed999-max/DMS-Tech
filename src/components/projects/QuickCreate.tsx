"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createMilestoneAction, createProjectAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { useRun } from "./shared";

type Opt = { id: string; label: string };

/** Quick create "Milestone" (Create menu): pick a managed project first. */
export function MilestoneQuickCreate({ projects }: { projects: Opt[] }) {
  const t = useTranslations("os.projects");
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(true);
  const [f, setF] = useState({ projectId: projects[0]?.id ?? "", title: "", dueDate: "", weight: "10" });
  const close = () => {
    setOpen(false);
    router.replace("/app/projects");
  };
  return (
    <Modal open={open} onClose={close} title={t("newMilestone")}>
      {projects.length === 0 ? (
        <p className="text-sm text-os-muted">{t("noManagedProjects")}</p>
      ) : (
        <div className="grid gap-3">
          <Field label={t("f.project")}>
            <select className="os-input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("f.title")}>
            <input className="os-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("f.due")}>
              <input type="date" className="os-input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
            </Field>
            <Field label={t("f.weight")}>
              <input type="number" min={1} max={100} dir="ltr" className="os-input" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
            </Field>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending || !f.projectId || f.title.trim().length < 2 || !f.dueDate} onClick={() => run(() => createMilestoneAction(f.projectId, { title: f.title, dueDate: f.dueDate, weight: Number(f.weight) }), () => router.push(`/app/projects/${f.projectId}?tab=milestones`))}>
              {t("create")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

type Source = { id: string; label: string; serviceId: string | null };

/** Project creation: commercial source (contract / quotation by policy / internal by policy), template, team lead and dates. */
export function CreateProjectForm({
  contracts,
  quotations,
  internalAllowed,
  templates,
  people,
  me,
  initial
}: {
  contracts: Source[];
  quotations: Source[] | null;
  internalAllowed: boolean;
  templates: (Opt & { serviceId: string | null })[];
  people: Opt[] | null;
  me: string;
  initial: { source: "contract" | "quotation" | "internal"; id: string };
}) {
  const t = useTranslations("os.projects");
  const router = useRouter();
  const { pending, error, run } = useRun();
  const pick = (source: string, id: string) => (source === "contract" ? contracts : (quotations ?? [])).find((x) => x.id === id);
  const suggested = (source: string, id: string) => templates.find((tp) => tp.serviceId && tp.serviceId === pick(source, id)?.serviceId)?.id ?? "";
  const [f, setF] = useState({ source: initial.source, sourceId: initial.id, name: "", templateId: suggested(initial.source, initial.id), milestoneSource: "template", projectManagerId: me, startDate: "", targetEndDate: "", priority: "MEDIUM" });
  const sources = f.source === "contract" ? contracts : f.source === "quotation" ? (quotations ?? []) : [];
  const submit = () =>
    run(
      () =>
        createProjectAction({
          source: f.source,
          contractId: f.source === "contract" ? f.sourceId : null,
          quotationId: f.source === "quotation" ? f.sourceId : null,
          name: f.name || null,
          templateId: f.milestoneSource === "template" ? f.templateId || null : null,
          milestoneSource: f.milestoneSource,
          projectManagerId: f.projectManagerId || null,
          startDate: f.startDate || null,
          targetEndDate: f.targetEndDate || null,
          priority: f.priority
        }),
      (r) => r.ok && router.push(`/app/projects/${(r.data as { id: string }).id}`)
    );
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="os-card grid gap-4 p-4 sm:grid-cols-2">
        <div className="flex flex-wrap gap-1.5 sm:col-span-2">
          {(["contract", ...(quotations ? ["quotation"] : []), ...(internalAllowed ? ["internal"] : [])] as const).map((s) => (
            <button key={s} type="button" className={f.source === s ? "os-btn-primary h-8 px-3 text-xs" : "os-btn-secondary h-8 px-3 text-xs"} onClick={() => setF({ ...f, source: s as typeof f.source, sourceId: "", templateId: "" })}>
              {t(`source.${s}` as "source.contract")}
            </button>
          ))}
        </div>
        {f.source !== "internal" && (
          <div className="sm:col-span-2">
            <Field label={t(`source.${f.source}` as "source.contract")} hint={f.source === "contract" ? t("contractHint") : t("quotationHint")}>
              <select className="os-input" value={f.sourceId} onChange={(e) => setF({ ...f, sourceId: e.target.value, templateId: suggested(f.source, e.target.value) })}>
                <option value="">—</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            {sources.length === 0 && <p className="mt-1 text-xs text-os-faint">{t("noSources")}</p>}
          </div>
        )}
        <div className="sm:col-span-2">
          <Field label={t("f.name")} hint={f.source !== "internal" ? t("nameHint") : undefined}>
            <input className="os-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("f.structure")}>
            <div className="flex flex-wrap gap-3 text-sm">
              {(["template", ...(f.source === "contract" ? ["contract"] : []), "none"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5">
                  <input type="radio" checked={f.milestoneSource === m} onChange={() => setF({ ...f, milestoneSource: m })} className="accent-[#624de3]" /> {t(`structure.${m}` as "structure.template")}
                </label>
              ))}
            </div>
          </Field>
        </div>
        {f.milestoneSource === "template" && (
          <div className="sm:col-span-2">
            <Field label={t("f.template")} hint={t("templateHint")}>
              <select className="os-input" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>
                <option value="">{t("autoTemplate")}</option>
                {templates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label={t("f.start")}>
          <input type="date" className="os-input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </Field>
        <Field label={t("f.target")}>
          <input type="date" className="os-input" value={f.targetEndDate} onChange={(e) => setF({ ...f, targetEndDate: e.target.value })} />
        </Field>
        {people && (
          <Field label={t("f.pm")}>
            <select className="os-input" value={f.projectManagerId} onChange={(e) => setF({ ...f, projectManagerId: e.target.value })}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("f.priority")}>
          <select className="os-input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}` as "priority.LOW")}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <aside className="os-card grid content-start gap-3 p-4 text-sm lg:sticky lg:top-20">
        <p className="font-semibold">{t("createSummary")}</p>
        <p className="text-xs text-os-muted">{t(`sourceHelp.${f.source}` as "sourceHelp.contract")}</p>
        <p className="text-xs text-os-muted">{t("snapshotNote")}</p>
        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <button type="button" className="os-btn-primary" disabled={pending || (f.source !== "internal" && !f.sourceId) || (f.source === "internal" && f.name.trim().length < 2)} onClick={submit}>
          {t("createProject")}
        </button>
      </aside>
    </div>
  );
}
