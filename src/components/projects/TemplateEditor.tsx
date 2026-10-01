"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveTemplateAction } from "@/lib/os/project-actions";
import { Field, Modal } from "@/components/os/client";
import { useRun } from "./shared";

type TTask = { titleAr: string; titleEn: string; estimateHours: string; role: string };
type TMs = { titleAr: string; titleEn: string; weight: string; offsetDays: string; tasks: TTask[] };
export type TemplateDraft = { id?: string; code: string; nameAr: string; nameEn: string; descriptionAr: string; descriptionEn: string; serviceId: string; active: boolean; milestones: TMs[] };

const ROLES = ["PROJECT_MANAGER", "TECH_LEAD", "DEVELOPER", "DESIGNER", "MARKETING", "QA", "ACCOUNT_MANAGER", "CONTRIBUTOR", "OBSERVER"];
const blankMs = (): TMs => ({ titleAr: "", titleEn: "", weight: "10", offsetDays: "0", tasks: [] });

/** Create / edit a project template. Saving replaces the template structure; existing projects keep their snapshot. */
export function TemplateEditor({ initial, services, label }: { initial: TemplateDraft | null; services: { id: string; label: string }[]; label: string }) {
  const t = useTranslations("os.projects");
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<TemplateDraft>(initial ?? { code: "", nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "", serviceId: "", active: true, milestones: [blankMs()] });
  const setMs = (i: number, patch: Partial<TMs>) => setF({ ...f, milestones: f.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setTask = (i: number, k: number, patch: Partial<TTask>) => setMs(i, { tasks: f.milestones[i].tasks.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
  const total = f.milestones.reduce((s, m) => s + (Number(m.weight) || 0), 0);
  const save = () =>
    run(
      () =>
        saveTemplateAction({
          ...f,
          serviceId: f.serviceId || null,
          descriptionAr: f.descriptionAr || null,
          descriptionEn: f.descriptionEn || null,
          milestones: f.milestones.map((m) => ({ ...m, weight: Number(m.weight), offsetDays: Number(m.offsetDays), tasks: m.tasks.map((x) => ({ titleAr: x.titleAr, titleEn: x.titleEn, estimateHours: x.estimateHours ? Number(x.estimateHours) : undefined, role: x.role || undefined })) }))
        }),
      () => {
        setOpen(false);
        router.refresh();
      }
    );
  return (
    <>
      <button type="button" className={initial ? "os-btn-ghost h-7 px-2 text-xs" : "os-btn-primary"} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} wide>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pe-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t("tpl.code")} hint={t("tpl.codeHint")}>
              <input className="os-input" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} />
            </Field>
            <Field label={t("f.service")}>
              <select className="os-input" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
                <option value="">—</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("tpl.nameAr")}>
              <input className="os-input" dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
            </Field>
            <Field label={t("tpl.nameEn")}>
              <input className="os-input" dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-[#624de3]" /> {t("tpl.active")}
          </label>
          <p className={`text-xs ${total === 100 ? "text-os-muted" : "text-warning"}`}>{t("tpl.weightTotal", { n: total })}</p>
          {f.milestones.map((m, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-os-line p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_80px_90px_auto]">
                <input className="os-input" dir="rtl" placeholder={t("tpl.titleAr")} value={m.titleAr} onChange={(e) => setMs(i, { titleAr: e.target.value })} />
                <input className="os-input" dir="ltr" placeholder={t("tpl.titleEn")} value={m.titleEn} onChange={(e) => setMs(i, { titleEn: e.target.value })} />
                <input className="os-input" type="number" min={1} max={100} dir="ltr" title={t("f.weight")} value={m.weight} onChange={(e) => setMs(i, { weight: e.target.value })} />
                <input className="os-input" type="number" min={0} dir="ltr" title={t("tpl.offset")} placeholder={t("tpl.offset")} value={m.offsetDays} onChange={(e) => setMs(i, { offsetDays: e.target.value })} />
                <button type="button" className="os-btn-ghost h-9 px-2 text-xs text-danger" disabled={f.milestones.length === 1} onClick={() => setF({ ...f, milestones: f.milestones.filter((_, j) => j !== i) })}>
                  {t("remove")}
                </button>
              </div>
              {m.tasks.map((x, k) => (
                <div key={k} className="grid gap-2 ps-4 sm:grid-cols-[1fr_1fr_80px_130px_auto]">
                  <input className="os-input h-8 text-xs" dir="rtl" placeholder={t("tpl.taskAr")} value={x.titleAr} onChange={(e) => setTask(i, k, { titleAr: e.target.value })} />
                  <input className="os-input h-8 text-xs" dir="ltr" placeholder={t("tpl.taskEn")} value={x.titleEn} onChange={(e) => setTask(i, k, { titleEn: e.target.value })} />
                  <input className="os-input h-8 text-xs" type="number" min={0} step="0.5" dir="ltr" placeholder={t("tpl.hours")} value={x.estimateHours} onChange={(e) => setTask(i, k, { estimateHours: e.target.value })} />
                  <select className="os-input h-8 text-xs" value={x.role} onChange={(e) => setTask(i, k, { role: e.target.value })}>
                    <option value="">—</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`roles.${r}` as "roles.DEVELOPER")}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="os-btn-ghost h-8 px-2 text-xs" onClick={() => setMs(i, { tasks: m.tasks.filter((_, j) => j !== k) })}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="os-btn-ghost h-7 justify-self-start px-2 text-xs" onClick={() => setMs(i, { tasks: [...m.tasks, { titleAr: "", titleEn: "", estimateHours: "", role: "" }] })}>
                + {t("tpl.addTask")}
              </button>
            </div>
          ))}
          <button type="button" className="os-btn-secondary h-8 justify-self-start px-3 text-xs" onClick={() => setF({ ...f, milestones: [...f.milestones, blankMs()] })}>
            + {t("tpl.addMilestone")}
          </button>
          <p className="text-xs text-os-faint">{t("tpl.snapshotNote")}</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="os-btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="button" className="os-btn-primary" disabled={pending} onClick={save}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
