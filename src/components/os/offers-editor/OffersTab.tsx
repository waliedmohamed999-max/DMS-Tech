import { useState } from "react";
import { basisPrice, offerStatus, type Catalog, type Offer } from "@/content/offers";
import { Card, Check, IconBtn, IconPick, LField, LList, Label, Num, type Opt, Select, emptyL, money, move, plusDays, slugify, today, uniqueKey, useT } from "./shared";

// --- offers ---------------------------------------------------------------------------------------

export function OffersTab({
  cat,
  setCat,
  services,
  disabled,
  userName,
}: {
  cat: Catalog;
  setCat: (c: Catalog) => void;
  services: Opt[];
  disabled: boolean;
  userName: string;
}) {
  const { x, AR } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const tiers = cat.groups.flatMap((g) => g.tiers.map((t) => ({ g, t })));
  const fixed = tiers.filter(
    ({ g, t }) => !t.from && t.price !== null && !g.draft,
  );
  const tierOpts: Opt[] = fixed.map(({ g, t }) => ({
    value: t.key,
    label: `${AR ? g.short.ar : g.short.en} — ${AR ? t.name.ar : t.name.en} (${money(t.price, AR)}${t.billing === "one-time" ? "" : x(" شهرياً", "/mo")})`,
  }));
  const setOffer = (i: number, o: Offer) =>
    setCat({ ...cat, offers: cat.offers.map((y, j) => (j === i ? o : y)) });
  const statusLabel = {
    live: x("يعمل الآن", "Live now"),
    scheduled: x("مجدول", "Scheduled"),
    ended: x("انتهى", "Ended"),
    invalid: x(
      "لن يظهر — راجع السعر والباقات والاعتماد",
      "Won't show — check price, packages and approval",
    ),
  };
  const addOffer = () => {
    const first = fixed[0];
    if (!first) return;
    const slug = uniqueKey(
      "new-offer",
      new Set([
        ...cat.offers.map((o) => o.slug),
        ...tiers.map(({ t }) => t.key),
      ]),
    );
    const start = today();
    const o: Offer = {
      slug,
      service: first.g.service,
      icon: "Tag",
      campaign: cat.offers[0]?.campaign ?? {
        ar: "عروض لفترة محدودة",
        en: "Limited-time offers",
      },
      name: { ar: "عرض جديد", en: "New offer" },
      pitch: emptyL(),
      forWho: emptyL(),
      price: Math.round((first.t.price ?? 0) * 0.85),
      basis: [{ key: first.t.key }],
      terms: [],
      startsAt: start,
      endsAt: plusDays(start, 13),
      approved: null,
    };
    setCat({ ...cat, offers: [...cat.offers, o] });
    setOpen(slug);
  };

  return (
    <div className="grid gap-4">
      <div className="os-card grid gap-2 p-4 text-sm leading-relaxed text-os-muted">
        <p>
          {x(
            "العرض = سعر خاص على باقة أو أكثر لفترة محددة. محتواه وما لا يشمله وسعره قبل الخصم تُؤخذ تلقائياً من الباقات التي تختارها، فلا يمكن أن يتعارض معها. يظهر العرض للزوار فقط إذا كان معتمداً، وسعره أقل من باقاته، وبين تاريخي البداية والنهاية.",
            "An offer is a special price on one or more packages for set dates. Its contents, exclusions and struck price come from the packages you pick, so it can't contradict them. Visitors see it only when approved, cheaper than its packages and between its dates.",
          )}
        </p>
      </div>
      {!disabled && (
        <button
          type="button"
          className="os-btn-primary w-fit"
          onClick={addOffer}
          disabled={!fixed.length}
        >
          + {x("عرض جديد", "New offer")}
        </button>
      )}
      {cat.offers.length === 0 && (
        <p className="os-card p-6 text-center text-sm text-os-muted">
          {x("لا توجد عروض الآن.", "No offers yet.")}
        </p>
      )}
      {cat.offers.map((o, i) => {
        const base = basisPrice(o, cat.groups);
        const status = offerStatus(o, new Date(), cat.groups);
        const off = base ? Math.round((1 - o.price / base) * 100) : null;
        const set = <K extends keyof Offer>(k: K, v: Offer[K]) =>
          setOffer(i, { ...o, [k]: v });
        return (
          <Card
            key={`${o.slug}-${i}`}
            title={AR ? o.name.ar : o.name.en}
            sub={`${money(o.price, AR)} ${base ? `${x("بدلاً من", "instead of")} ${money(base, AR)} (${off}%)` : ""} · ${o.startsAt} → ${o.endsAt} · ${statusLabel[status]}`}
            open={open === o.slug}
            onToggle={() => setOpen(open === o.slug ? null : o.slug)}
            tools={
              !disabled && (
                <>
                  <IconBtn
                    icon="ChevronDown"
                    label={x("تحريك لأسفل", "Move down")}
                    onClick={() =>
                      setCat({ ...cat, offers: move(cat.offers, i, 1) })
                    }
                  />
                  <IconBtn
                    icon="X"
                    danger
                    label={x("حذف العرض", "Delete offer")}
                    onClick={() =>
                      window.confirm(
                        x(`حذف عرض «${o.name.ar}»؟`, `Delete "${o.name.en}"?`),
                      ) &&
                      setCat({
                        ...cat,
                        offers: cat.offers.filter((_, j) => j !== i),
                      })
                    }
                  />
                </>
              )
            }
          >
            <div
              className={`rounded-lg px-3 py-2 text-sm font-medium ${status === "invalid" ? "bg-danger/10 text-danger" : status === "live" ? "bg-success/10 text-success" : "bg-os-raised text-os-muted"}`}
            >
              {statusLabel[status]}
              {base !== null && (
                <span className="ms-2 font-normal">
                  · {x("قيمة الباقات", "Packages value")} {money(base, AR)} ·{" "}
                  {x("التوفير", "Saving")} {money(base - o.price, AR)} ({off}%)
                </span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Label
                text={x("رابط العرض", "Offer link")}
                hint={`/offers/${o.slug}`}
              >
                <input
                  className="os-input"
                  dir="ltr"
                  value={o.slug}
                  disabled={disabled}
                  onChange={(e) => set("slug", slugify(e.target.value))}
                />
              </Label>
              <IconPick
                value={o.icon}
                onChange={(v) => set("icon", v)}
                disabled={disabled}
              />
              <Num
                label={x(
                  "سعر العرض قبل الضريبة (ر.س)",
                  "Offer price before VAT (SAR)",
                )}
                value={o.price}
                onChange={(v) => set("price", v ?? 0)}
                disabled={disabled}
              />
              <Select
                label={x("صفحة الخدمة المرتبطة", "Linked service page")}
                value={o.service}
                options={services}
                onChange={(v) => set("service", v)}
                disabled={disabled}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Label text={x("يبدأ في", "Starts on")}>
                <input
                  type="date"
                  className="os-input"
                  dir="ltr"
                  value={o.startsAt}
                  disabled={disabled}
                  onChange={(e) => set("startsAt", e.target.value)}
                />
              </Label>
              <Label text={x("ينتهي في (آخر يوم)", "Ends on (last day)")}>
                <input
                  type="date"
                  className="os-input"
                  dir="ltr"
                  value={o.endsAt}
                  disabled={disabled}
                  onChange={(e) => set("endsAt", e.target.value)}
                />
              </Label>
              <div className="grid content-end">
                <Check
                  label={x("العرض معتمد", "Offer approved")}
                  hint={
                    o.approved ??
                    x(
                      "بدون اعتماد لا يظهر للزوار",
                      "Without approval visitors don't see it",
                    )
                  }
                  checked={Boolean(o.approved)}
                  disabled={disabled}
                  onChange={(v) =>
                    set("approved", v ? `${userName} — ${today()}` : null)
                  }
                />
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border border-os-line p-3">
              <span className="os-label mb-0">
                {x("الباقات داخل العرض", "Packages in the offer")}
              </span>
              {o.basis.map((b, bi) => {
                const t = tiers.find((y) => y.t.key === b.key)?.t;
                return (
                  <div
                    key={bi}
                    className="grid items-end gap-2 md:grid-cols-[1fr_140px_auto]"
                  >
                    <Select
                      label={x("الباقة", "Package")}
                      value={b.key}
                      options={tierOpts}
                      disabled={disabled}
                      onChange={(v) =>
                        set(
                          "basis",
                          o.basis.map((y, j) =>
                            j === bi ? { ...y, key: v } : y,
                          ),
                        )
                      }
                    />
                    {t && t.billing !== "one-time" ? (
                      <Num
                        label={x("عدد الأشهر", "Months")}
                        value={b.months ?? 1}
                        disabled={disabled}
                        onChange={(v) =>
                          set(
                            "basis",
                            o.basis.map((y, j) =>
                              j === bi
                                ? {
                                    ...y,
                                    months: Math.max(1, Math.round(v ?? 1)),
                                  }
                                : y,
                            ),
                          )
                        }
                      />
                    ) : (
                      <span />
                    )}
                    {!disabled && (
                      <IconBtn
                        icon="X"
                        danger
                        label={x("إزالة", "Remove")}
                        disabled={o.basis.length < 2}
                        onClick={() =>
                          set(
                            "basis",
                            o.basis.filter((_, j) => j !== bi),
                          )
                        }
                      />
                    )}
                  </div>
                );
              })}
              {!disabled && (
                <button
                  type="button"
                  className="os-btn-ghost h-8 w-fit px-2 text-xs"
                  onClick={() =>
                    set("basis", [...o.basis, { key: fixed[0]?.t.key ?? "" }])
                  }
                >
                  + {x("إضافة باقة للعرض", "Add a package")}
                </button>
              )}
            </div>
            <LField
              label={x(
                "اسم الحملة (يظهر أعلى البانر)",
                "Campaign name (top of the banner)",
              )}
              value={o.campaign}
              onChange={(v) => set("campaign", v)}
              disabled={disabled}
              hint={x(
                "اسم القسم في الصفحة يُؤخذ من أول عرض",
                "The page section title comes from the first offer",
              )}
            />
            <LField
              label={x("اسم العرض", "Offer name")}
              value={o.name}
              onChange={(v) => set("name", v)}
              disabled={disabled}
            />
            <LField
              label={x(
                "جملة العرض (ماذا يحصل العميل)",
                "Pitch (what the client gets)",
              )}
              value={o.pitch}
              onChange={(v) => set("pitch", v)}
              long
              disabled={disabled}
            />
            <LField
              label={x("لمن هذا العرض؟", "Who is it for?")}
              value={o.forWho}
              onChange={(v) => set("forWho", v)}
              long
              disabled={disabled}
            />
            <LList
              label={x("شروط العرض", "Offer conditions")}
              items={o.terms}
              onChange={(v) => set("terms", v)}
              disabled={disabled}
            />
          </Card>
        );
      })}
    </div>
  );
}
