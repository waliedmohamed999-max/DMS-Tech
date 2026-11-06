"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useErrorText, CopyText, Field, Modal } from "@/components/os/client";
import { createAccountAction, linkUserAction } from "@/lib/os/hr-actions";

type Opt = { value: string; label: string };

const T = {
  ar: {
    create: "إنشاء حساب دخول",
    createNote: "ينشئ حساب دخول للموظف ببريده الوظيفي وكلمة مرور مؤقتة يغيّرها عند أول دخول.",
    roles: "الأدوار",
    link: "ربط بحساب موجود",
    linkNote: "اربط الموظف بحساب دخول موجود لم يُربط بموظف بعد — بعدها تظهر له «شؤوني الوظيفية».",
    account: "الحساب",
    unlink: "فك الربط",
    unlinkConfirm: "فك ربط الحساب بالموظف؟ يبقى الحساب كما هو، لكن «شؤوني الوظيفية» لن تظهر لصاحبه حتى يُربط من جديد.",
    temp: "كلمة المرور المؤقتة",
    tempHint: "تظهر مرة واحدة فقط — سلّمها للموظف، وسيُطلب منه تغييرها عند أول دخول.",
    noUsers: "لا توجد حسابات غير مرتبطة. أنشئ حساباً جديداً بدلاً من ذلك.",
    save: "حفظ",
    cancel: "إلغاء",
    done: "تم",
    copy: "نسخ",
    errors: { USER_ALREADY_LINKED: "هذا الحساب مرتبط بموظف آخر.", WORK_EMAIL_REQUIRED: "أضف البريد الوظيفي للموظف أولاً (تعديل).", EMAIL_TAKEN: "يوجد حساب بنفس البريد الوظيفي — استخدم «ربط بحساب موجود»." } as Record<string, string>
  },
  en: {
    create: "Create login account",
    createNote: "Creates a login account with the work e-mail and a temporary password, changed at first sign-in.",
    roles: "Roles",
    link: "Link an existing account",
    linkNote: "Link the employee to an existing account not yet linked to anyone — they then see My HR.",
    account: "Account",
    unlink: "Unlink",
    unlinkConfirm: "Unlink the account from this employee? The account stays, but My HR is hidden until it is linked again.",
    temp: "Temporary password",
    tempHint: "Shown once only — hand it to the employee; they must change it at first sign-in.",
    noUsers: "No unlinked accounts. Create a new account instead.",
    save: "Save",
    cancel: "Cancel",
    done: "Done",
    copy: "Copy",
    errors: { USER_ALREADY_LINKED: "This account is linked to another employee.", WORK_EMAIL_REQUIRED: "Add the employee's work e-mail first (Edit).", EMAIL_TAKEN: "An account with this work e-mail exists — use Link an existing account." } as Record<string, string>
  }
};

/** The employee's system account: create one (and show its temporary password once), link an existing one, or unlink. */
export function EmployeeAccount({ locale, employeeId, linked, canCreate, canLink, roles, users }: { locale: "ar" | "en"; employeeId: string; linked: boolean; canCreate: boolean; canLink: boolean; roles: Opt[]; users: Opt[] }) {
  const t = T[locale];
  const errText = useErrorText();
  const router = useRouter();
  const [open, setOpen] = useState<"create" | "link" | "unlink" | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [userId, setUserId] = useState("");
  const [temp, setTemp] = useState<string | null>(null);
  const show = (k: typeof open) => {
    setError(null);
    setTemp(null);
    setOpen(k);
  };
  const fail = (r: { error: string }) => setError(t.errors[r.error] ?? errText(r.error));
  const close = () => {
    setOpen(null);
    if (temp) router.refresh();
  };

  const foot = (onSave: () => void, disabled = false) => (
    <>
      {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="os-btn-ghost" onClick={close}>
          {t.cancel}
        </button>
        <button type="button" className="os-btn-primary" disabled={pending || disabled} onClick={onSave}>
          {t.save}
        </button>
      </div>
    </>
  );

  return (
    <>
      {linked
        ? canLink && (
            <button type="button" className="os-btn-ghost" onClick={() => show("unlink")}>
              {t.unlink}
            </button>
          )
        : (
            <>
              {canCreate && (
                <button type="button" className="os-btn-secondary" onClick={() => show("create")}>
                  {t.create}
                </button>
              )}
              {canLink && (
                <button type="button" className="os-btn-ghost" onClick={() => show("link")}>
                  {t.link}
                </button>
              )}
            </>
          )}

      <Modal open={open === "create"} onClose={close} title={t.create}>
        {temp ? (
          <div className="grid gap-3 text-sm">
            <p className="os-label">{t.temp}</p>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-os-raised px-3 py-2 text-base font-semibold" dir="ltr">
                {temp}
              </code>
              <CopyText value={temp} label={t.copy} />
            </div>
            <p className="text-xs text-os-faint">{t.tempHint}</p>
            <div className="flex justify-end">
              <button type="button" className="os-btn-primary" onClick={close}>
                {t.done}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 text-sm">
            <p className="text-xs text-os-muted">{t.createNote}</p>
            <fieldset className="grid gap-1">
              <legend className="os-label">{t.roles} *</legend>
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-os-line p-2">
                {roles.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={roleIds.includes(o.value)} onChange={(e) => setRoleIds((a) => (e.target.checked ? [...a, o.value] : a.filter((x) => x !== o.value)))} />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {foot(
              () =>
                start(async () => {
                  setError(null);
                  const r = await createAccountAction(employeeId, roleIds);
                  if (!r.ok) return fail(r);
                  setTemp(r.data?.tempPassword ?? null);
                }),
              !roleIds.length
            )}
          </div>
        )}
      </Modal>

      <Modal open={open === "link"} onClose={close} title={t.link}>
        <div className="grid gap-3 text-sm">
          <p className="text-xs text-os-muted">{t.linkNote}</p>
          {users.length === 0 ? (
            <p className="text-xs text-os-faint">{t.noUsers}</p>
          ) : (
            <Field label={t.account}>
              <select className="os-input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {foot(
            () =>
              start(async () => {
                const r = await linkUserAction(employeeId, userId);
                if (!r.ok) return fail(r);
                setOpen(null);
                router.refresh();
              }),
            !userId
          )}
        </div>
      </Modal>

      <Modal open={open === "unlink"} onClose={close} title={t.unlink}>
        <div className="grid gap-3 text-sm">
          <p>{t.unlinkConfirm}</p>
          {foot(() =>
            start(async () => {
              const r = await linkUserAction(employeeId, null);
              if (!r.ok) return fail(r);
              setOpen(null);
              router.refresh();
            })
          )}
        </div>
      </Modal>
    </>
  );
}
