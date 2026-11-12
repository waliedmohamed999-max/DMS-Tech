"use client";

// Parts of the editor live in ./offers-editor/ (shared controls, package form, sections, offers, page texts).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { type Catalog } from "@/content/offers";
import { discardCatalogAction, publishCatalogAction, restoreCatalogAction, saveCatalogAction } from "@/lib/os/website-actions";
import { Label, LangCtx, type Opt, type State } from "./offers-editor/shared";
import { GroupsTab } from "./offers-editor/GroupsTab";
import { OffersTab } from "./offers-editor/OffersTab";
import { CopyTab } from "./offers-editor/CopyTab";

// --- the editor -----------------------------------------------------------------------------------

const ERRORS: Record<string, [string, string]> = {
  CATALOG_INVALID: [
    "بيانات ناقصة أو غير صحيحة — راجع الحقل",
    "Missing or invalid data — check the field",
  ],
  CATALOG_HAS_PROBLEMS: [
    "لا يمكن النشر قبل حل المشكلات المذكورة",
    "Fix the listed problems before publishing",
  ],
  CATALOG_NO_DRAFT: [
    "لا توجد مسودة محفوظة للنشر",
    "There is no saved draft to publish",
  ],
  FORBIDDEN: [
    "ليست لديك صلاحية لهذا الإجراء",
    "You don't have permission for this",
  ],
  UNAUTHENTICATED: [
    "انتهت الجلسة، سجّل الدخول مرة أخرى",
    "Your session ended, sign in again",
  ],
};
/** "groups.2.tiers.0.price" → "Section 3 ← package 1 ← price" */
const friendlyPath = (p: string, cat: Catalog, AR: boolean) => {
  const m = /^groups\.(\d+)(?:\.tiers\.(\d+))?\.?(.*)$/.exec(p);
  if (m) {
    const g = cat.groups[Number(m[1])];
    const t = m[2] !== undefined ? g?.tiers[Number(m[2])] : null;
    return [
      g ? (AR ? g.title.ar : g.title.en) : `#${Number(m[1]) + 1}`,
      t ? (AR ? t.name.ar : t.name.en) : null,
      m[3] || null,
    ]
      .filter(Boolean)
      .join(" ← ");
  }
  const o = /^offers\.(\d+)\.?(.*)$/.exec(p);
  if (o)
    return [
      cat.offers[Number(o[1])]
        ? AR
          ? cat.offers[Number(o[1])].name.ar
          : cat.offers[Number(o[1])].name.en
        : `#${Number(o[1]) + 1}`,
      o[2] || null,
    ]
      .filter(Boolean)
      .join(" ← ");
  return p;
};

export function OffersEditor({
  locale,
  initial,
  state,
  canEdit,
  canPublish,
  services,
  me,
}: {
  locale: "ar" | "en";
  initial: Catalog;
  state: State;
  canEdit: boolean;
  canPublish: boolean;
  services: Opt[];
  me: string;
}) {
  const AR = locale === "ar";
  const x = (ar: string, en: string) => (AR ? ar : en);
  const router = useRouter();
  const [cat, setCatRaw] = useState<Catalog>(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"groups" | "offers" | "copy" | "publish">(
    "groups",
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState(state.problems);
  const [notes, setNotes] = useState(state.notes);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const disabled = !canEdit;
  const setCat = (c: Catalog) => {
    setCatRaw(c);
    setDirty(true);
    setMsg(null);
  };
  // a fresh server state (after save / publish / restore) replaces the local copy
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCatRaw(initial);
    setProblems(state.problems);
    setNotes(state.notes);
    setDirty(false);
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const fail = (r: { error: string; field?: Record<string, string> }) => {
    const e = ERRORS[r.error];
    const where = r.field?._detail
      ? ` (${friendlyPath(r.field._detail, cat, AR)})`
      : "";
    setMsg({ ok: false, text: `${e ? x(...e) : r.error}${where}` });
  };
  const save = (then?: () => void) =>
    start(async () => {
      const r = await saveCatalogAction(cat);
      if (!r.ok) return fail(r);
      setDirty(false);
      setProblems(r.data?.problems ?? []);
      setNotes(r.data?.notes ?? []);
      setMsg({
        ok: true,
        text: x(
          "تم حفظ المسودة. الزوار ما زالوا يرون النسخة المنشورة.",
          "Draft saved. Visitors still see the published version.",
        ),
      });
      router.refresh();
      then?.();
    });

  const tabs: {
    key: typeof tab;
    label: string;
    icon: IconName;
    count?: number;
  }[] = [
    {
      key: "groups",
      label: x("الأقسام والباقات", "Sections & packages"),
      icon: "Layers",
      count: cat.groups.reduce((s, g) => s + g.tiers.length, 0),
    },
    {
      key: "offers",
      label: x("العروض", "Offers"),
      icon: "Tag",
      count: cat.offers.length,
    },
    { key: "copy", label: x("نصوص الصفحة", "Page texts"), icon: "FileText" },
    {
      key: "publish",
      label: x("النشر والسجل", "Publish & history"),
      icon: "CloudUpload",
      count: problems.length || undefined,
    },
  ];

  return (
    <LangCtx.Provider value={AR}>
      <div className="grid gap-4">
        {/* status + actions, always in view */}
        <div className="os-card sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 p-3 shadow-sm">
          <div className="grid gap-0.5 text-xs text-os-muted">
            <span>
              {state.live
                ? x(
                    `المنشور الآن: النسخة ${state.live.version}${state.live.publishedBy ? ` — ${state.live.publishedBy}` : ""}`,
                    `Live: version ${state.live.version}${state.live.publishedBy ? ` — ${state.live.publishedBy}` : ""}`,
                  )
                : x(
                    "المنشور الآن: النسخة الأصلية المدمجة في الموقع",
                    "Live: the original built-in catalog",
                  )}
            </span>
            <span className={dirty ? "font-semibold text-warning" : ""}>
              {dirty
                ? x("لديك تعديلات غير محفوظة", "You have unsaved changes")
                : state.hasDraft
                  ? x(
                      "توجد مسودة محفوظة لم تُنشر",
                      "A saved draft is waiting to be published",
                    )
                  : x(
                      "لا توجد مسودة — التعديل يبدأ من النسخة المنشورة",
                      "No draft — editing starts from the live version",
                    )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                className="os-btn-primary"
                disabled={pending || !dirty}
                onClick={() => save()}
              >
                {pending ? (
                  <Icon name="Timer" size={15} className="animate-spin" />
                ) : (
                  <Icon name="Check" size={15} />
                )}{" "}
                {x("حفظ المسودة", "Save draft")}
              </button>
            )}
            <a
              className={`os-btn-secondary ${!state.hasDraft && !dirty ? "pointer-events-none opacity-50" : ""}`}
              href="/offers?preview=draft"
              target="_blank"
              rel="noreferrer"
              onClick={(e) =>
                dirty &&
                (e.preventDefault(),
                save(() => window.open("/offers?preview=draft", "_blank")))
              }
            >
              <Icon name="ExternalLink" size={15} />{" "}
              {x("معاينة المسودة", "Preview draft")}
            </a>
            <a
              className="os-btn-ghost"
              href="/offers"
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="Globe" size={15} />{" "}
              {x("الصفحة المنشورة", "Live page")}
            </a>
          </div>
        </div>
        {msg && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
          >
            {msg.text}
          </p>
        )}
        {disabled && (
          <p className="rounded-lg bg-os-raised px-3 py-2 text-sm text-os-muted">
            {x(
              "عرض فقط — ليست لديك صلاحية التعديل.",
              "View only — you can't edit.",
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-1 border-b border-os-line">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}
            >
              <Icon name={t.icon} size={15} /> {t.label}
              {t.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-[11px] ${t.key === "publish" ? "bg-danger/15 text-danger" : "bg-os-raised text-os-muted"}`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "groups" && (
          <GroupsTab
            cat={cat}
            setCat={setCat}
            services={services}
            disabled={disabled}
          />
        )}
        {tab === "offers" && (
          <OffersTab
            cat={cat}
            setCat={setCat}
            services={services}
            disabled={disabled}
            userName={me}
          />
        )}
        {tab === "copy" && (
          <CopyTab cat={cat} setCat={setCat} disabled={disabled} />
        )}
        {tab === "publish" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="os-card grid content-start gap-3 p-4">
              <h2 className="text-base font-semibold">
                {x("قبل النشر", "Before publishing")}
              </h2>
              {dirty && (
                <p className="text-sm text-warning">
                  {x(
                    "احفظ المسودة أولاً لتحديث الفحص.",
                    "Save the draft first to refresh the check.",
                  )}
                </p>
              )}
              {problems.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <Icon name="CircleCheck" size={16} />{" "}
                  {x(
                    "لا توجد تعارضات — المسودة جاهزة للنشر.",
                    "No contradictions — the draft is ready to publish.",
                  )}
                </p>
              ) : (
                <ul className="grid gap-1.5">
                  {problems.map((p, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
                    >
                      <b>{p.where}:</b> {AR ? p.ar : p.en}
                    </li>
                  ))}
                </ul>
              )}
              {notes.length > 0 && (
                <ul className="grid gap-1.5">
                  {notes.map((p, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning"
                    >
                      <b>{p.where}:</b> {AR ? p.ar : p.en}
                    </li>
                  ))}
                </ul>
              )}
              {canPublish ? (
                <div className="grid gap-2 border-t border-os-line pt-3">
                  <Label
                    text={x(
                      "ملاحظة على هذه النسخة (اختياري)",
                      "Note for this version (optional)",
                    )}
                  >
                    <input
                      className="os-input"
                      value={note}
                      maxLength={300}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={x(
                        "مثال: عروض ديسمبر",
                        "e.g. December offers",
                      )}
                    />
                  </Label>
                  <button
                    type="button"
                    className="os-btn-primary w-fit"
                    disabled={
                      pending || dirty || !state.hasDraft || problems.length > 0
                    }
                    onClick={() => {
                      if (
                        !window.confirm(
                          x(
                            "نشر المسودة؟ ستظهر للزوار فوراً.",
                            "Publish the draft? Visitors will see it right away.",
                          ),
                        )
                      )
                        return;
                      start(async () => {
                        const r = await publishCatalogAction(note);
                        if (!r.ok) return fail(r);
                        setNote("");
                        setMsg({
                          ok: true,
                          text: x(
                            `تم النشر (النسخة ${r.data?.version}). الصفحة تتحدث للزوار خلال 30 ثانية.`,
                            `Published (version ${r.data?.version}). Visitors see it within 30 seconds.`,
                          ),
                        });
                        router.refresh();
                      });
                    }}
                  >
                    <Icon name="CloudUpload" size={15} />{" "}
                    {x("نشر للزوار", "Publish to visitors")}
                  </button>
                </div>
              ) : (
                <p className="border-t border-os-line pt-3 text-sm text-os-muted">
                  {x(
                    "النشر للمدير التنفيذي أو المدير العام. احفظ المسودة وأبلغهم لمراجعتها.",
                    "Publishing is for the CEO or general manager. Save the draft and ask them to review it.",
                  )}
                </p>
              )}
              {canEdit && state.hasDraft && (
                <button
                  type="button"
                  className="os-btn-ghost w-fit text-danger"
                  disabled={pending}
                  onClick={() =>
                    window.confirm(
                      x(
                        "تجاهل المسودة والرجوع للنسخة المنشورة؟",
                        "Discard the draft and go back to the live version?",
                      ),
                    ) &&
                    start(async () => {
                      const r = await discardCatalogAction();
                      if (!r.ok) return fail(r);
                      setMsg({
                        ok: true,
                        text: x("تم تجاهل المسودة.", "Draft discarded."),
                      });
                      router.refresh();
                    })
                  }
                >
                  <Icon name="RotateCcw" size={15} />{" "}
                  {x("تجاهل المسودة", "Discard draft")}
                </button>
              )}
            </div>
            <div className="os-card grid content-start gap-3 p-4">
              <h2 className="text-base font-semibold">
                {x("سجل النسخ المنشورة", "Published versions")}
              </h2>
              {state.history.length === 0 && (
                <p className="text-sm text-os-muted">
                  {x(
                    "لم يُنشر شيء من لوحة التحكم بعد — الموقع يعرض النسخة الأصلية.",
                    "Nothing published from the dashboard yet — the site shows the original catalog.",
                  )}
                </p>
              )}
              <ul className="divide-y divide-os-line">
                {state.history.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="grid">
                      <span className="font-medium">
                        {x("النسخة", "Version")} {h.version}{" "}
                        {h.live && (
                          <span className="ms-1 rounded-full bg-success/15 px-2 text-[11px] text-success">
                            {x("المنشورة", "Live")}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-os-muted">
                        {h.publishedAt
                          ? new Date(h.publishedAt).toLocaleString(
                              AR ? "ar-SA-u-nu-latn" : "en-GB",
                            )
                          : ""}{" "}
                        {h.publishedBy ? `— ${h.publishedBy}` : ""}{" "}
                        {h.note ? `· ${h.note}` : ""}
                      </span>
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        className="os-btn-ghost h-8 text-xs"
                        disabled={pending}
                        onClick={() =>
                          window.confirm(
                            x(
                              "نسخ هذه النسخة إلى المسودة؟ (تستبدل المسودة الحالية)",
                              "Copy this version into the draft? (replaces the current draft)",
                            ),
                          ) &&
                          start(async () => {
                            const r = await restoreCatalogAction(h.id);
                            if (!r.ok) return fail(r);
                            setMsg({
                              ok: true,
                              text: x(
                                "تم نسخها إلى المسودة — راجعها ثم انشرها.",
                                "Copied into the draft — review it, then publish.",
                              ),
                            });
                            router.refresh();
                          })
                        }
                      >
                        <Icon name="RotateCcw" size={14} />{" "}
                        {x("استرجاع", "Restore")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <button
                  type="button"
                  className="os-btn-ghost w-fit text-xs"
                  disabled={pending}
                  onClick={() =>
                    window.confirm(
                      x(
                        "نسخ النسخة الأصلية المدمجة في الموقع إلى المسودة؟",
                        "Copy the original built-in catalog into the draft?",
                      ),
                    ) &&
                    start(async () => {
                      const r = await restoreCatalogAction("builtin");
                      if (!r.ok) return fail(r);
                      setMsg({
                        ok: true,
                        text: x(
                          "تم نسخ النسخة الأصلية إلى المسودة.",
                          "The original catalog was copied into the draft.",
                        ),
                      });
                      router.refresh();
                    })
                  }
                >
                  <Icon name="RotateCcw" size={14} />{" "}
                  {x("البدء من النسخة الأصلية", "Start from the original")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </LangCtx.Provider>
  );
}
