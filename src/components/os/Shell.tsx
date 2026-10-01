"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/Icon";
import { logoutAction, markReadAction, notificationsPeekAction, searchAction, setLocaleAction } from "@/lib/os/actions";

export type ShellNavItem = { key: string; href: string; icon: IconName; label: string; about: string; live: boolean; phase: number };
export type ShellNavGroup = { key: string; label: string; items: ShellNavItem[] };
export type ShellCreateItem = { key: string; icon: IconName; label: string; href?: string; phase?: number };
export type ShellUser = { name: string; email: string; role: string };

type Peek = { items: { id: string; title: string; body: string | null; href: string | null; readAt: Date | null; createdAt: Date; category: string }[]; unread: number };

function useLocalBool(key: string, initial: boolean) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate a per-viewer UI preference after mount
      if (s !== null) setV(s === "1");
    } catch {}
  }, [key]);
  const set = (x: boolean) => {
    setV(x);
    try {
      localStorage.setItem(key, x ? "1" : "0");
    } catch {}
  };
  return [v, set] as const;
}

const isActive = (pathname: string, href: string) => (href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/"));

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ groups, collapsed, onCollapse, mobileOpen, onNavigate }: { groups: ShellNavGroup[]; collapsed: boolean; onCollapse: (v: boolean) => void; mobileOpen: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("os.nav");
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-40 flex flex-col border-e border-os-line bg-os-panel transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-dvh ${
        collapsed ? "lg:w-[68px]" : "lg:w-[256px]"
      } w-[272px] ${mobileOpen ? "translate-x-0" : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full"}`}
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-os-line px-4">
        <Link href="/app" className="flex min-w-0 items-center gap-2.5" onClick={onNavigate}>
          <Image src="/images/logo-dark.png" alt="DMS Tech" width={1200} height={437} className={`h-7 w-auto ${collapsed ? "lg:hidden" : ""}`} />
          {collapsed && <span className="hidden size-8 place-items-center rounded-md bg-iris text-sm font-bold text-white lg:grid">D</span>}
        </Link>
        <button type="button" onClick={() => onCollapse(!collapsed)} className="os-btn-ghost hidden size-8 px-0 lg:inline-flex" aria-label={collapsed ? t("expand") : t("collapse")}>
          <Icon name={collapsed ? "ChevronLeft" : "ChevronRight"} size={16} className="ltr:rotate-180" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="OS">
        {groups.map((g) => {
          const isClosed = closed[g.key] && !collapsed;
          return (
            <div key={g.key} className="mb-2">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setClosed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-os-faint hover:text-os-muted"
                  aria-expanded={!isClosed}
                >
                  {g.label}
                  <Icon name="ChevronDown" size={13} className={`transition ${isClosed ? "-rotate-90 rtl:rotate-90" : ""}`} />
                </button>
              )}
              {collapsed && <div className="mx-3 my-2 hidden h-px bg-os-line lg:block" />}
              {!isClosed && (
                <ul className="grid gap-0.5">
                  {g.items.map((it) => {
                    const active = isActive(pathname, it.href);
                    return (
                      <li key={it.key}>
                        <Link
                          href={it.href}
                          onClick={onNavigate}
                          title={collapsed ? it.label : undefined}
                          className={`group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition ${
                            active ? "bg-os-raised text-os-text shadow-[inset_2px_0_0_var(--color-iris)] rtl:shadow-[inset_-2px_0_0_var(--color-iris)]" : "text-os-muted hover:bg-os-surface hover:text-os-text"
                          } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
                        >
                          <Icon name={it.icon} size={16} className={active ? "text-iris-light" : ""} />
                          <span className={`flex-1 truncate ${collapsed ? "lg:hidden" : ""}`}>{it.label}</span>
                          {!it.live && !collapsed && <span className="rounded border border-os-line px-1 text-[10px] text-os-faint">{t("planned")}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Popover helper
// ---------------------------------------------------------------------------

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const panel = "absolute end-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-os-line-strong bg-os-surface shadow-sm2";

function CreateMenu({ items }: { items: ShellCreateItem[] }) {
  const t = useTranslations("os.topbar");
  const { open: pOpen, setOpen: pSetOpen, ref: pRef } = usePopover();
  return (
    <div ref={pRef} className="relative">
      <button type="button" onClick={() => pSetOpen(!pOpen)} className="os-btn-primary h-9" aria-expanded={pOpen}>
        <span className="text-base leading-none">+</span>
        <span className="hidden sm:inline">{t("create")}</span>
      </button>
      {pOpen && (
        <div className={`${panel} w-64 p-1.5`}>
          {items.map((it) =>
            it.href ? (
              <Link key={it.key} href={it.href} onClick={() => pSetOpen(false)} className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-os-text hover:bg-os-raised">
                <Icon name={it.icon} size={15} className="text-os-muted" />
                {it.label}
              </Link>
            ) : (
              <span key={it.key} className="flex h-9 cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 text-sm text-os-faint">
                <Icon name={it.icon} size={15} />
                <span className="flex-1">{it.label}</span>
                <span className="text-[10.5px]">{t("createPlanned", { n: it.phase ?? 0 })}</span>
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Notifications({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations("os");
  const locale = useLocale();
  const router = useRouter();
  const { open: pOpen, setOpen: pSetOpen, ref: pRef } = usePopover();
  const [data, setData] = useState<Peek | null>(null);
  const [, start] = useTransition();
  const unread = data?.unread ?? initialUnread;

  const load = useCallback(() => {
    start(async () => {
      const r = await notificationsPeekAction();
      if (r.ok && r.data) setData(r.data as Peek);
    });
  }, []);

  return (
    <div ref={pRef} className="relative">
      <button
        type="button"
        onClick={() => {
          pSetOpen(!pOpen);
          if (!pOpen) load();
        }}
        className="os-btn-ghost relative size-9 px-0"
        aria-label={t("topbar.notifications")}
      >
        <Icon name="Inbox" size={18} />
        {unread > 0 && <span className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {pOpen && (
        <div className={`${panel} w-[360px] max-w-[calc(100vw-2rem)]`}>
          <div className="flex h-11 items-center justify-between border-b border-os-line px-3">
            <span className="text-sm font-semibold">{t("topbar.notifications")}</span>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-iris-light hover:underline"
                onClick={() =>
                  start(async () => {
                    await markReadAction("all");
                    load();
                    router.refresh();
                  })
                }
              >
                {t("common.markAllRead")}
              </button>
            )}
          </div>
          <ul className="max-h-[380px] overflow-y-auto">
            {!data && <li className="px-3 py-6 text-center text-sm text-os-muted">{t("common.loading")}</li>}
            {data?.items.length === 0 && <li className="px-3 py-8 text-center text-sm text-os-muted">{t("topbar.noNotifications")}</li>}
            {data?.items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href ?? "/app/notifications"}
                  onClick={() => {
                    pSetOpen(false);
                    if (!n.readAt) start(async () => void (await markReadAction([n.id])));
                  }}
                  className="flex gap-3 border-b border-os-line px-3 py-2.5 hover:bg-os-raised"
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-iris"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-os-text">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-os-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-os-faint">{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(n.createdAt))}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/app/notifications" onClick={() => pSetOpen(false)} className="block border-t border-os-line px-3 py-2.5 text-center text-xs text-os-muted hover:text-os-text">
            {t("common.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const t = useTranslations("os");
  const locale = useLocale();
  const router = useRouter();
  const { open: pOpen, setOpen: pSetOpen, ref: pRef } = usePopover();
  const [pending, start] = useTransition();
  const initials = user.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div ref={pRef} className="relative">
      <button type="button" onClick={() => pSetOpen(!pOpen)} className="flex h-9 items-center gap-2 rounded-md px-1.5 hover:bg-os-raised" aria-expanded={pOpen}>
        <span className="grid size-7 place-items-center rounded-full bg-iris/25 text-[11px] font-semibold text-iris-light">{initials}</span>
        <span className="hidden text-start leading-tight md:block">
          <span className="block max-w-[140px] truncate text-[13px] text-os-text">{user.name}</span>
          <span className="block max-w-[140px] truncate text-[11px] text-os-faint">{user.role}</span>
        </span>
      </button>
      {pOpen && (
        <div className={`${panel} w-60 p-1.5`}>
          <div className="border-b border-os-line px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-os-muted" dir="ltr">
              {user.email}
            </p>
          </div>
          <Link href="/app/me" onClick={() => pSetOpen(false)} className="mt-1 flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm hover:bg-os-raised">
            <Icon name="ShieldCheck" size={15} className="text-os-muted" />
            {t("topbar.profile")}
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setLocaleAction(locale === "ar" ? "en" : "ar");
                router.refresh();
              })
            }
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm hover:bg-os-raised"
          >
            <Icon name="Languages" size={15} className="text-os-muted" />
            {t("common.language")}
          </button>
          <form action={logoutAction}>
            <button type="submit" className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-danger hover:bg-danger/10">
              <Icon name="ArrowRight" size={15} className="rtl:rotate-180" />
              {t("topbar.logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command palette (Ctrl/⌘ + K)
// ---------------------------------------------------------------------------

type PaletteEntry = { id: string; icon: IconName; title: string; subtitle?: string; href: string; group: "nav" | "result" };

function CommandPalette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: ShellNavItem[] }) {
  const t = useTranslations("os.palette");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PaletteEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const navEntries = useMemo<PaletteEntry[]>(
    () =>
      nav
        .filter((n) => n.live)
        .filter((n) => !q || `${n.label} ${n.about}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8)
        .map((n) => ({ id: `nav-${n.key}`, icon: n.icon, title: n.label, subtitle: n.about, href: n.href, group: "nav" })),
    [nav, q]
  );
  const entries = [...results, ...navEntries];

  const typeIcon: Record<string, IconName> = { user: "Users", approval: "BadgeCheck", department: "Network", lead: "Filter", opportunity: "Target", client: "Building2", contact: "Users", service: "Package", quotation: "FileText", contract: "Handshake", project: "Layers", task: "ClipboardList", milestone: "Route" };

  const onChange = (v: string) => {
    setQ(v);
    setIdx(0);
    clearTimeout(timer.current);
    if (v.trim().length < 2) return setResults([]);
    timer.current = setTimeout(async () => {
      const r = await searchAction(v);
      if (r.ok && r.data)
        setResults(
          (r.data as { type: string; id: string; title: string; subtitle?: string; href: string }[]).map((x) => ({
            id: `${x.type}-${x.id}`,
            icon: typeIcon[x.type] ?? "Search",
            title: x.title,
            subtitle: `${t(`types.${x.type}` as "types.user")} · ${x.subtitle ?? ""}`,
            href: x.href,
            group: "result"
          }))
        );
    }, 220);
  };

  const go = (e?: PaletteEntry) => {
    if (!e) return;
    onClose();
    setQ("");
    setResults([]);
    router.push(e.href);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid items-start justify-items-center bg-black/60 px-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-os-line-strong bg-os-surface shadow-sm2" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center gap-3 border-b border-os-line px-4">
          <Icon name="Search" size={17} className="text-os-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setIdx((i) => Math.min(i + 1, entries.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setIdx((i) => Math.max(i - 1, 0)));
              if (e.key === "Enter") go(entries[idx]);
              if (e.key === "Escape") onClose();
            }}
            placeholder={t("placeholder")}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-os-faint"
          />
          <kbd className="rounded border border-os-line px-1.5 text-[10px] text-os-faint">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {entries.length === 0 && <li className="px-3 py-8 text-center text-sm text-os-muted">{t("empty")}</li>}
          {entries.map((e, i) => (
            <li key={e.id}>
              {(i === 0 || entries[i - 1].group !== e.group) && <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-os-faint">{e.group === "nav" ? t("navigate") : t("results")}</p>}
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(e)}
                className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start ${i === idx ? "bg-os-raised" : ""}`}
              >
                <Icon name={e.icon} size={16} className="text-os-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-os-text">{e.title}</span>
                  {e.subtitle && <span className="block truncate text-xs text-os-faint">{e.subtitle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("hint")}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export default function Shell({
  groups,
  createItems,
  user,
  unread,
  nova,
  children
}: {
  groups: ShellNavGroup[];
  createItems: ShellCreateItem[];
  user: ShellUser;
  unread: number;
  /** null = user lacks nova.use; NOVA is an external platform, the OS only launches it */
  nova: { configured: boolean } | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("os.topbar");
  const [collapsed, setCollapsed] = useLocalBool("os.sidebar.collapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh">
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <Sidebar groups={groups} collapsed={collapsed} onCollapse={setCollapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-os-line bg-os-bg/90 px-3 backdrop-blur sm:px-5">
          <button type="button" onClick={() => setMobileOpen(true)} className="os-btn-ghost size-9 px-0 lg:hidden" aria-label="menu">
            <Icon name="Menu" size={18} />
          </button>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-os-line bg-os-surface px-3 text-sm text-os-faint transition hover:border-os-line-strong sm:max-w-md"
          >
            <Icon name="Search" size={15} />
            <span className="flex-1 truncate text-start">{t("search")}</span>
            <kbd className="hidden rounded border border-os-line px-1.5 text-[10px] sm:inline" dir="ltr">
              Ctrl K
            </kbd>
          </button>
          <div className="ms-auto flex items-center gap-1.5">
            <CreateMenu items={createItems} />
            {nova &&
              (nova.configured ? (
                // audited server-side launch (see /app/nova/launch) — opens the external platform
                <a href="/app/nova/launch" target="_blank" rel="noopener" className="os-btn-secondary h-9 gap-1.5 px-2.5" title={t("nova")}>
                  <Icon name="Sparkles" size={15} className="text-iris-light" />
                  <span className="hidden sm:inline">{t("nova")}</span>
                  <Icon name="ExternalLink" size={12} className="hidden text-os-faint sm:inline" />
                </a>
              ) : (
                <Link href="/app/nova" className="os-btn-secondary h-9 gap-1.5 px-2.5" title={t("nova")}>
                  <Icon name="Sparkles" size={15} className="text-iris-light" />
                  <span className="hidden sm:inline">{t("nova")}</span>
                </Link>
              ))}
            <Notifications initialUnread={unread} />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-6 sm:px-6">{children}</main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} nav={allItems} />
    </div>
  );
}
