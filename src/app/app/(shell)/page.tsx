import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx, requireSession } from "@/lib/os/dal";
import { getAttention, getKpis, type Kpi } from "@/server/dashboard/service";
import { listActivity } from "@/server/feed";
import { pipelineSummary } from "@/server/crm/insights";
import { can } from "@/server/context";
import { StageColumns } from "@/components/crm/Charts";
import { novaStatus } from "@/server/integrations/nova";
import { projectKpis } from "@/server/projects/insights";
import { listProjects } from "@/server/projects/projects";
import type { Ctx } from "@/server/context";
import { CREATE_ITEMS, findModule } from "@/lib/os/modules";
import { Icon } from "@/components/ui/Icon";
import { Badge, EmptyState, fmtDate, fmtMoney, fmtNumber, fmtRelative, PermissionDenied, priorityTone, SectionCard } from "@/components/os/ui";
import ApprovalControls from "@/components/os/ApprovalControls";
import ActivityList from "@/components/os/ActivityList";

export const metadata = { title: "Command Center" };

function KpiCard({ k, label, locale, t }: { k: Kpi; label: string; locale: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (k.state === "planned") {
    const mod = findModule(k.module);
    return (
      <div className="os-card flex min-h-[112px] flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-os-muted">{label}</span>
          <Badge>{t("common.phase", { n: k.phase })}</Badge>
        </div>
        <div>
          <p className="text-2xl font-semibold text-os-faint">—</p>
          <p className="mt-1 line-clamp-2 text-[11.5px] text-os-faint">{t("home.plannedText", { module: mod ? mod.label[locale as "ar"] : k.module })}</p>
        </div>
      </div>
    );
  }
  if (k.state === "forbidden") return null;
  const delta = k.previous != null && k.previous > 0 ? Math.round(((k.value - k.previous) / k.previous) * 100) : null;
  const body = (
    <div className="os-card flex min-h-[112px] flex-col justify-between p-4 transition hover:border-os-line-strong">
      <span className="text-[13px] text-os-muted">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <p className={`${k.format === "currency" ? "text-[22px]" : "text-[28px]"} font-semibold leading-none tracking-[-0.5px] tabular`} dir="ltr">
          {k.format === "currency" ? fmtMoney(k.value, locale) : fmtNumber(k.value, locale)}
        </p>
        {delta !== null && (
          <span title={t("home.vsPrev")} className={`text-xs font-medium tabular ${delta >= 0 ? "text-success" : "text-danger"}`} dir="ltr">
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
  return k.href ? <Link href={k.href}>{body}</Link> : body;
}

function PlannedPanel({ title, phase, module, locale, t }: { title: string; phase: number; module: string; locale: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const mod = findModule(module);
  return (
    <SectionCard title={title} action={<Badge>{t("common.phase", { n: phase })}</Badge>}>
      <EmptyState icon={mod?.icon ?? "Layers"} title={t("home.plannedTitle", { n: phase })} text={t("home.plannedText", { module: mod ? mod.label[locale as "ar"] : module })} action={mod ? <Link href={mod.href} className="os-btn-ghost text-xs">{mod.label[locale as "ar"]}</Link> : undefined} />
    </SectionCard>
  );
}

/** Phase 4 delivery panel — live counts and the projects that most need a look (scoped to what the viewer may see). */
async function ProjectsPanel({ ctx }: { ctx: Ctx }) {
  const t = await getTranslations("os");
  const tp = await getTranslations("os.projects");
  const [k, risk, attention] = await Promise.all([projectKpis(ctx), listProjects(ctx, { status: "open", health: "AT_RISK", sort: "targetEndDate", dir: "asc" }), listProjects(ctx, { status: "open", health: "NEEDS_ATTENTION", sort: "targetEndDate", dir: "asc" })]);
  const rows = [...risk.items, ...attention.items].slice(0, 5);
  const cells: [string, number, string, string?][] = [
    [tp("m.active"), k.active, "/app/projects?status=open"],
    [tp("m.atRisk"), k.atRisk, "/app/projects?view=at_risk", k.atRisk ? "text-danger" : undefined],
    [tp("m.overdueMilestones"), k.overdueMilestones, "/app/projects?status=open", k.overdueMilestones ? "text-danger" : undefined],
    [tp("m.blockedTasks"), k.blockedTasks, "/app/projects?status=open", k.blockedTasks ? "text-warning" : undefined]
  ];
  return (
    <SectionCard title={t("home.projects")} action={<Link href="/app/projects" className="text-xs text-os-muted hover:text-os-text">{t("common.viewAll")}</Link>}>
      <div className="grid grid-cols-4 gap-px border-b border-os-line bg-os-line">
        {cells.map(([label, value, href, cls]) => (
          <Link key={label} href={href} className="bg-os-surface px-3 py-2.5 hover:bg-os-panel">
            <p className="truncate text-[11px] text-os-muted">{label}</p>
            <p className={`text-lg font-semibold tabular ${cls ?? ""}`}>{value}</p>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-os-muted">{k.active ? tp("healthOk") : tp("emptyTitle")}</p>
      ) : (
        <ul className="divide-y divide-os-line">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <Link href={`/app/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                <span className="text-os-faint" dir="ltr">{p.number}</span> · {p.name}
              </Link>
              <span className="text-xs tabular text-os-muted">{p.progress}%</span>
              <Badge tone={p.health === "AT_RISK" ? "danger" : "warning"}>{tp(`health.${p.health}` as "health.HEALTHY")}</Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default async function CommandCenter() {
  const { ctx, allowed } = await pageCtx("dashboard.view");
  if (!allowed) return <PermissionDenied permission="dashboard.view" />;
  const session = await requireSession();
  const locale = await getLocale();
  const t = await getTranslations("os");
  const tt = (k: string, v?: Record<string, string | number>) => t(k as "common.save", v as never);

  const [kpis, attention, activity, pipeline] = await Promise.all([getKpis(ctx), getAttention(ctx), listActivity(ctx, { page: 1 }), can(ctx, "crm.opportunities.view") ? pipelineSummary(ctx) : Promise.resolve(null)]);

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Riyadh" }).format(new Date()));
  const greet = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const name = ((locale === "ar" && session.user.nameAr) || session.user.name).split(" ")[0];

  const quick = CREATE_ITEMS.map((c) => ({ c, mod: findModule(c.module)! })).filter(({ c, mod }) => mod && (!(c.permission ?? mod.permission) || ctx.permissions.has((c.permission ?? mod.permission)!)));

  return (
    <div className="grid gap-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-os-faint">{fmtDate(new Date(), locale, { dateStyle: "full" })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.4px]">
            {t(`home.${greet}`)}{locale === "ar" ? "، " : ", "}{name}
          </h1>
          <p className="mt-1 text-sm text-os-muted">{t("home.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quick.slice(0, 8).map(({ c, mod }) =>
            mod.live && c.href ? (
              <Link key={c.key} href={c.href} className="os-btn-secondary h-8 px-2.5 text-xs">
                <Icon name={c.icon} size={14} /> {c.label[locale as "ar"]}
              </Link>
            ) : (
              <span key={c.key} title={t("topbar.createPlanned", { n: mod.phase })} className="os-btn-secondary pointer-events-none h-8 px-2.5 text-xs opacity-40">
                <Icon name={c.icon} size={14} /> {c.label[locale as "ar"]}
              </span>
            )
          )}
        </div>
      </div>

      {/* KPIs */}
      <section aria-label={t("home.kpis")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("home.kpis")}</h2>
          <span className="text-xs text-os-faint">{t("home.vsPrev")}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <KpiCard key={k.key} k={k} label={t(`home.kpi.${k.key}` as "home.kpi.team")} locale={locale} t={tt} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Needs your attention */}
        <SectionCard title={t("home.attention")} action={attention.length ? <Badge tone="warning">{attention.length}</Badge> : undefined}>
          {attention.length === 0 ? (
            <EmptyState icon="CircleCheck" title={t("home.attentionEmpty")} text={t("home.attentionEmptyText")} />
          ) : (
            <ul className="divide-y divide-os-line">
              {attention.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={`size-2 shrink-0 rounded-full ${a.priority === "URGENT" ? "bg-danger" : a.priority === "HIGH" ? "bg-warning" : a.priority === "MEDIUM" ? "bg-info" : "bg-os-faint"}`} />
                  <div className="min-w-0 flex-1">
                    <Link href={a.href} className="block truncate text-sm font-medium hover:text-iris-light">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-os-faint">
                      <span>{t.has(`home.categories.${a.category}`) ? t(`home.categories.${a.category}` as "home.categories.approval") : a.category}</span>
                      {a.owner && <span>· {a.owner}</span>}
                      {a.dueAt && <span>· {fmtRelative(a.dueAt, locale)}</span>}
                    </p>
                  </div>
                  <Badge tone={priorityTone(a.priority)}>{t(`priority.${a.priority}`)}</Badge>
                  {a.actions.includes("approve") ? (
                    <ApprovalControls approvalId={a.entity.id} compact />
                  ) : (
                    <Link href={a.href} className="os-btn-secondary h-7 px-2.5 text-xs">
                      {t("common.open")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Activity */}
        <SectionCard title={t("home.activity")} action={<Link href="/app/activity" className="text-xs text-os-muted hover:text-os-text">{t("common.viewAll")}</Link>}>
          {activity.items.length ? <ActivityList items={activity.items.slice(0, 8)} /> : <EmptyState icon="ChartLine" title={t("home.activityEmpty")} text={t("activity.emptyText")} />}
        </SectionCard>
      </div>

      {/* Live pipeline (Phase 2) + modules that unlock in later phases — explicitly not faked */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {pipeline && (
          <SectionCard className="lg:col-span-2 xl:col-span-3" title={t("home.pipeline")} action={<Link href="/app/crm/pipeline" className="text-xs text-os-muted hover:text-os-text">{t("common.viewAll")}</Link>}>
            <StageColumns rows={pipeline.map((s) => ({ key: s.key, label: locale === "ar" ? s.nameAr : s.nameEn, count: s.count, value: Number(s.value) }))} locale={locale} empty={t("home.pipelineEmpty")} />
          </SectionCard>
        )}
        <PlannedPanel title={t("home.cash")} phase={5} module="invoices" locale={locale} t={tt} />
        {can(ctx, "projects.view") && <ProjectsPanel ctx={ctx} />}
        {/* NOVA AI is an external DMS Tech platform: launch only, no simulated AI output */}
        {can(ctx, "nova.use") && (
          <SectionCard title={t("home.insights")} action={<Badge tone="iris">{t("nova.external")}</Badge>}>
            <EmptyState
              icon="Sparkles"
              title={novaStatus().configured ? t("nova.configured") : t("nova.notConfigured")}
              text={t("home.novaText")}
              action={
                novaStatus().configured ? (
                  <a href="/app/nova/launch" target="_blank" rel="noopener" className="os-btn-primary h-8 px-3 text-xs">
                    {t("nova.open")} <Icon name="ExternalLink" size={12} />
                  </a>
                ) : (
                  <Link href="/app/nova" className="os-btn-ghost text-xs">
                    {t("nova.statusTitle")}
                  </Link>
                )
              }
            />
          </SectionCard>
        )}
      </div>
    </div>
  );
}
