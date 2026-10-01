"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/os/action";
import { Icon } from "@/components/ui/Icon";

/** Translate an action error code (falls back to the generic code). */
export function useErrorText() {
  const t = useTranslations("os.errors");
  return (code?: string) => (code ? (t.has(code) ? t(code) : t("UNKNOWN")) : "");
}

/** Debounced search input + selects that write to the URL (server does the filtering). */
export function FilterBar({ search, selects = [] }: { search?: { name?: string; placeholder: string }; selects?: { name: string; options: { value: string; label: string }[]; allLabel: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get(search?.name ?? "q") ?? "");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.replace(`${pathname}?${next}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-os-line p-3">
      {search && (
        <label className="relative min-w-[220px] flex-1">
          <Icon name="Search" size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-os-faint" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(timer.current);
              const v = e.target.value;
              timer.current = setTimeout(() => push(search.name ?? "q", v), 300);
            }}
            placeholder={search.placeholder}
            className="os-input ps-9"
          />
        </label>
      )}
      {selects.map((s) => (
        <select key={s.name} value={params.get(s.name) ?? ""} onChange={(e) => push(s.name, e.target.value)} className="os-input w-auto min-w-[150px]">
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}

/** Button that runs a server action with pending state, optional confirm and error display. */
export function ActionButton({
  action,
  children,
  className = "os-btn-secondary",
  confirm,
  onDone
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  onDone?: (r: ActionResult<unknown>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const err = useErrorText();
  return (
    <span className="inline-grid gap-1">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setError(r.ok ? undefined : r.error);
            onDone?.(r);
          });
        }}
      >
        {pending ? <Icon name="Timer" size={15} className="animate-spin" /> : null}
        {children}
      </button>
      {error && <span className="text-xs text-danger">{err(error)}</span>}
    </span>
  );
}

/** Minimal accessible modal built on <dialog>. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-os-line-strong bg-os-surface p-0 text-os-text shadow-sm2 backdrop:bg-black/60`}
    >
      <div className="flex h-12 items-center justify-between border-b border-os-line px-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="os-btn-ghost size-8 px-0" aria-label="close">
          <Icon name="X" size={16} />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-4">{open && children}</div>
    </dialog>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-0">
      <span className="os-label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 text-xs text-os-faint">{hint}</span>}
      {error && <span className="mt-1 text-xs text-danger">{error}</span>}
    </label>
  );
}

export function CopyText({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="os-btn-secondary h-8 px-2.5 text-xs"
    >
      <Icon name={done ? "Check" : "ClipboardList"} size={14} />
      {label}
    </button>
  );
}
