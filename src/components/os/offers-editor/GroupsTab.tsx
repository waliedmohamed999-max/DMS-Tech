import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { type Catalog, type PackageGroup } from "@/content/offers";
import { Card, Check, IconBtn, IconPick, LField, LList, Label, type Opt, Select, clone, emptyL, money, move, slugify, uniqueKey, useT } from "./shared";
import { TierForm, newTier } from "./TierForm";

// --- sections -------------------------------------------------------------------------------------

export function GroupsTab({
  cat,
  setCat,
  services,
  disabled,
}: {
  cat: Catalog;
  setCat: (c: Catalog) => void;
  services: Opt[];
  disabled: boolean;
}) {
  const { x, AR } = useT();
  const [sel, setSel] = useState(0);
  const [openTier, setOpenTier] = useState<string | null>(null);
  const g = cat.groups[Math.min(sel, cat.groups.length - 1)];
  const gi = cat.groups.indexOf(g);
  const allTierKeys = new Set(
    cat.groups.flatMap((y) => y.tiers.map((t) => t.key)),
  );
  const setGroup = (ng: PackageGroup) =>
    setCat({ ...cat, groups: cat.groups.map((y, i) => (i === gi ? ng : y)) });
  const setG = <K extends keyof PackageGroup>(k: K, v: PackageGroup[K]) =>
    setGroup({ ...g, [k]: v });

  const addGroup = () => {
    const id = uniqueKey("new-section", new Set(cat.groups.map((y) => y.id)));
    const ng: PackageGroup = {
      id,
      segment: "smb",
      service: services[0]?.value ?? "web-development",
      icon: "Layers",
      title: { ar: "قسم جديد", en: "New section" },
      short: { ar: "قسم جديد", en: "New section" },
      text: emptyL(),
      highlights: [],
      notice: emptyL(),
      tiers: [newTier(uniqueKey(`${id}-basic`, allTierKeys))],
      draft: true,
    };
    setCat({ ...cat, groups: [...cat.groups, ng] });
    setSel(cat.groups.length);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="os-card h-fit overflow-hidden">
        <div className="border-b border-os-line px-3 py-2 text-xs font-semibold text-os-muted">
          {x("الأقسام (بترتيب ظهورها)", "Sections (in page order)")}
        </div>
        <ul className="divide-y divide-os-line">
          {cat.groups.map((y, i) => (
            <li
              key={`${y.id}-${i}`}
              className={`flex items-center gap-1 px-2 py-1.5 ${i === gi ? "bg-os-hover" : ""}`}
            >
              <button
                type="button"
                onClick={() => setSel(i)}
                className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-start text-sm"
              >
                <Icon
                  name={y.icon}
                  size={15}
                  className="shrink-0 text-iris-light"
                />
                <span className="grid min-w-0">
                  <span className="truncate font-medium">
                    {AR ? y.short.ar : y.short.en}
                  </span>
                  <span className="text-[11px] text-os-faint">
                    {y.tiers.length} {x("باقات", "packages")} ·{" "}
                    {y.segment === "smb"
                      ? x("باقات", "Packages")
                      : x("حلول الشركات", "Business")}
                    {y.draft ? ` · ${x("مسودة", "draft")}` : ""}
                  </span>
                </span>
              </button>
              {!disabled && (
                <span className="flex">
                  <button
                    type="button"
                    className="os-btn-ghost size-7 px-0"
                    title={x("لأعلى", "Up")}
                    onClick={() => (
                      setCat({ ...cat, groups: move(cat.groups, i, -1) }),
                      setSel(Math.max(0, i - 1))
                    )}
                  >
                    <Icon name="ChevronDown" size={14} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    className="os-btn-ghost size-7 px-0"
                    title={x("لأسفل", "Down")}
                    onClick={() => (
                      setCat({ ...cat, groups: move(cat.groups, i, 1) }),
                      setSel(Math.min(cat.groups.length - 1, i + 1))
                    )}
                  >
                    <Icon name="ChevronDown" size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!disabled && (
          <div className="border-t border-os-line p-2">
            <button
              type="button"
              className="os-btn-secondary w-full"
              onClick={addGroup}
            >
              + {x("قسم جديد", "New section")}
            </button>
          </div>
        )}
      </aside>

      {g && (
        <div className="grid content-start gap-4">
          <div className="os-card grid gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                {x("بيانات القسم", "Section details")}
              </h2>
              {!disabled && (
                <button
                  type="button"
                  className="os-btn-danger h-8 text-xs"
                  disabled={cat.groups.length < 2}
                  onClick={() => {
                    if (
                      !window.confirm(
                        x(
                          `حذف قسم «${g.title.ar}» وكل باقاته؟`,
                          `Delete the section "${g.title.en}" and all its packages?`,
                        ),
                      )
                    )
                      return;
                    setCat({
                      ...cat,
                      groups: cat.groups.filter((_, i) => i !== gi),
                    });
                    setSel(0);
                  }}
                >
                  <Icon name="X" size={14} /> {x("حذف القسم", "Delete section")}
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Label
                text={x("رابط القسم", "Section link")}
                hint={`/offers#pkg-${g.id}`}
              >
                <input
                  className="os-input"
                  dir="ltr"
                  value={g.id}
                  disabled={disabled}
                  onChange={(e) => setG("id", slugify(e.target.value))}
                />
              </Label>
              <IconPick
                value={g.icon}
                onChange={(v) => setG("icon", v)}
                disabled={disabled}
              />
              <Select
                label={x("مكانه في الصفحة", "Where it shows")}
                value={g.segment}
                disabled={disabled}
                options={[
                  { value: "smb", label: x("الباقات", "Packages") },
                  {
                    value: "business",
                    label: x(
                      "حلول الشركات (بعرض سعر)",
                      "Business solutions (quote)",
                    ),
                  },
                ]}
                onChange={(v) => setG("segment", v as PackageGroup["segment"])}
              />
              <Select
                label={x("صفحة الخدمة المرتبطة", "Linked service page")}
                value={g.service}
                options={services}
                disabled={disabled}
                onChange={(v) => setG("service", v)}
              />
            </div>
            <Check
              label={x(
                "مسودة (لا تظهر للزوار)",
                "Draft (hidden from visitors)",
              )}
              hint={x(
                "استخدمها لقسم لم تُعتمد أسعاره بعد",
                "Use it for a section whose prices aren't approved yet",
              )}
              checked={Boolean(g.draft)}
              onChange={(v) => setG("draft", v || undefined)}
              disabled={disabled}
            />
            <LField
              label={x("عنوان القسم", "Section title")}
              value={g.title}
              onChange={(v) => setG("title", v)}
              disabled={disabled}
            />
            <LField
              label={x("الاسم المختصر (في التبويب)", "Short name (tab)")}
              value={g.short}
              onChange={(v) => setG("short", v)}
              disabled={disabled}
            />
            <LField
              label={x("وصف القسم", "Section description")}
              value={g.text}
              onChange={(v) => setG("text", v)}
              long
              disabled={disabled}
            />
            <LList
              label={x("أهم المزايا (3 أسطر)", "Key highlights (3 lines)")}
              items={g.highlights}
              onChange={(v) => setG("highlights", v)}
              disabled={disabled}
            />
            <LField
              label={x(
                "ملاحظة الشروط فوق الباقات",
                "Conditions note above the packages",
              )}
              value={g.notice}
              onChange={(v) => setG("notice", v)}
              long
              disabled={disabled}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {x("باقات القسم", "Packages in this section")} ({g.tiers.length})
            </h2>
            {!disabled && (
              <button
                type="button"
                className="os-btn-primary"
                onClick={() => {
                  const key = uniqueKey(`${g.id}-new`, allTierKeys);
                  setG("tiers", [...g.tiers, newTier(key)]);
                  setOpenTier(key);
                }}
              >
                + {x("باقة جديدة", "New package")}
              </button>
            )}
          </div>
          {g.tiers.map((t, ti) => (
            <Card
              key={`${t.key}-${ti}`}
              title={`${AR ? t.name.ar : t.name.en}`}
              sub={`${t.from ? x("يبدأ من ", "from ") : ""}${money(t.price, AR)} · ${AR ? (t.period?.ar ?? "") : (t.period?.en ?? "")}`}
              open={openTier === t.key}
              onToggle={() => setOpenTier(openTier === t.key ? null : t.key)}
              tone={t.featured ? "featured" : undefined}
              tools={
                !disabled && (
                  <>
                    <IconBtn
                      icon="ChevronDown"
                      label={x("تحريك لأسفل", "Move down")}
                      onClick={() => setG("tiers", move(g.tiers, ti, 1))}
                    />
                    <IconBtn
                      icon="Layers"
                      label={x("نسخ الباقة", "Duplicate")}
                      onClick={() => {
                        const c = clone(t);
                        c.key = uniqueKey(`${t.key}-copy`, allTierKeys);
                        c.name = {
                          ar: `${t.name.ar} (نسخة)`,
                          en: `${t.name.en} (copy)`,
                        };
                        c.featured = undefined;
                        setG("tiers", [
                          ...g.tiers.slice(0, ti + 1),
                          c,
                          ...g.tiers.slice(ti + 1),
                        ]);
                        setOpenTier(c.key);
                      }}
                    />
                    <IconBtn
                      icon="X"
                      danger
                      label={x("حذف الباقة", "Delete package")}
                      disabled={g.tiers.length < 2}
                      onClick={() =>
                        window.confirm(
                          x(
                            `حذف باقة «${t.name.ar}»؟`,
                            `Delete "${t.name.en}"?`,
                          ),
                        ) &&
                        setG(
                          "tiers",
                          g.tiers.filter((_, j) => j !== ti),
                        )
                      }
                    />
                  </>
                )
              }
            >
              <TierForm
                t={t}
                disabled={disabled}
                onChange={(nt) =>
                  setG(
                    "tiers",
                    g.tiers.map((y, j) => (j === ti ? nt : y)),
                  )
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
