import { useState } from "react";
import { type Catalog } from "@/content/offers";
import { type L } from "@/content/types";
import { Check, IconBtn, IconPick, LField, LList, clone, emptyL, move, useT } from "./shared";

// --- page texts -----------------------------------------------------------------------------------

const COPY_LABELS: Record<string, [string, string]> = {
  eyebrow: ["اسم الصفحة", "Page name"],
  title: [
    "العنوان الرئيسي (ما بين * * يظهر ملوّناً)",
    "Main title (text between * * is highlighted)",
  ],
  sub: ["الوصف تحت العنوان", "Text under the title"],
  heroPoints: ["نقاط أعلى الصفحة", "Hero points"],
  glossary: ["معاني الكلمات (باقة / عرض / عرض سعر)", "Glossary"],
  offersNote: ["وصف قسم العروض", "Offers section text"],
  packagesTitle: ["عنوان قسم الباقات", "Packages title"],
  packagesSub: ["وصف قسم الباقات", "Packages text"],
  solutionsTitle: ["عنوان حلول الشركات", "Business solutions title"],
  solutionsSub: ["وصف حلول الشركات", "Business solutions text"],
  howTitle: ["عنوان «كيف نبدأ»", "“How we start” title"],
  how: ["خطوات «كيف نبدأ»", "“How we start” steps"],
  whyTitle: ["عنوان «لماذا نحن»", "“Why us” title"],
  whySub: ["وصف «لماذا نحن»", "“Why us” text"],
  why: ["أسباب «لماذا نحن»", "“Why us” items"],
  faqTitle: ["عنوان الأسئلة الشائعة", "FAQ title"],
  faqs: ["الأسئلة الشائعة", "FAQ"],
  termsTitle: ["عنوان الشروط العامة", "General terms title"],
  generalTerms: ["الشروط العامة", "General terms"],
  vatNote: ["ملاحظة الضريبة أسفل الباقات", "VAT note"],
  ctaTitle: ["عنوان الدعوة الأخيرة", "Closing title"],
  ctaText: ["نص الدعوة الأخيرة", "Closing text"],
  projectsTitle: ["عنوان «من أعمالنا»", "Projects title"],
  projectsSub: ["وصف «من أعمالنا»", "Projects text"],
};
const FIELD_LABELS: Record<string, [string, string]> = {
  title: ["العنوان", "Title"],
  text: ["النص", "Text"],
  q: ["السؤال", "Question"],
  a: ["الجواب", "Answer"],
  icon: ["الأيقونة", "Icon"],
};
const isLv = (v: unknown): v is L =>
  !!v &&
  typeof v === "object" &&
  typeof (v as L).ar === "string" &&
  typeof (v as L).en === "string" &&
  Object.keys(v as object).length === 2;

/** Any text shape from the page copy: a text, a list of texts, a list of cards, or a group of texts. */
function CopyValue({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  const { x, AR } = useT();
  if (isLv(value))
    return (
      <LField
        label={label}
        value={value}
        onChange={onChange}
        long={value.ar.length > 70}
        disabled={disabled}
      />
    );
  if (typeof value === "string")
    return <IconPick value={value} onChange={onChange} disabled={disabled} />;
  if (Array.isArray(value)) {
    if (value.every(isLv))
      return (
        <LList
          label={label}
          items={value as L[]}
          onChange={onChange}
          disabled={disabled}
        />
      );
    return (
      <div className="grid gap-2">
        <span className="os-label mb-0">{label}</span>
        {value.map((item, i) => (
          <div
            key={i}
            className="grid gap-3 rounded-lg border border-os-line p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-os-muted">
                #{i + 1}
              </span>
              {!disabled && (
                <span className="flex gap-1">
                  <IconBtn
                    icon="ChevronDown"
                    label={x("تحريك لأسفل", "Move down")}
                    onClick={() => onChange(move(value, i, 1))}
                  />
                  <IconBtn
                    icon="X"
                    danger
                    label={x("حذف", "Remove")}
                    onClick={() => onChange(value.filter((_, j) => j !== i))}
                  />
                </span>
              )}
            </div>
            {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
              <CopyValue
                key={k}
                label={FIELD_LABELS[k] ? x(...FIELD_LABELS[k]) : k}
                value={v}
                disabled={disabled}
                onChange={(nv) =>
                  onChange(
                    value.map((y, j) =>
                      j === i ? { ...(y as object), [k]: nv } : y,
                    ),
                  )
                }
              />
            ))}
          </div>
        ))}
        {!disabled && value.length > 0 && (
          <button
            type="button"
            className="os-btn-ghost h-8 w-fit px-2 text-xs"
            onClick={() => {
              const t = clone(value[0]) as Record<string, unknown>;
              for (const k of Object.keys(t)) if (isLv(t[k])) t[k] = emptyL();
              onChange([...value, t]);
            }}
          >
            + {x("إضافة", "Add")}
          </button>
        )}
      </div>
    );
  }
  if (value && typeof value === "object")
    return (
      <div className="grid gap-3 rounded-lg border border-os-line p-3">
        <span className="os-label mb-0">{label}</span>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <CopyValue
            key={k}
            label={k}
            value={v}
            disabled={disabled}
            onChange={(nv) => onChange({ ...(value as object), [k]: nv })}
          />
        ))}
      </div>
    );
  return null;
}

export function CopyTab({
  cat,
  setCat,
  disabled,
}: {
  cat: Catalog;
  setCat: (c: Catalog) => void;
  disabled: boolean;
}) {
  const { x, AR } = useT();
  const [showAll, setShowAll] = useState(false);
  const copy = cat.copy as unknown as Record<string, unknown>;
  const keys = Object.keys(copy).filter((k) => showAll || k in COPY_LABELS);
  return (
    <div className="grid gap-4">
      <div className="os-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-os-muted">
        <p>
          {x(
            "نصوص صفحة العروض: العناوين والأوصاف والأسئلة الشائعة والشروط. «كل النصوص» تعرض أيضاً الكلمات الصغيرة مثل أسماء الأزرار.",
            "The offers page texts: titles, descriptions, FAQ and terms. “All texts” also shows small words such as button labels.",
          )}
        </p>
        <Check
          label={x("كل النصوص", "All texts")}
          checked={showAll}
          onChange={setShowAll}
        />
      </div>
      <div className="os-card grid gap-5 p-4">
        {keys.map((k) => (
          <CopyValue
            key={k}
            label={COPY_LABELS[k] ? x(...COPY_LABELS[k]) : k}
            value={copy[k]}
            disabled={disabled}
            onChange={(v) =>
              setCat({
                ...cat,
                copy: { ...cat.copy, [k]: v } as Catalog["copy"],
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
