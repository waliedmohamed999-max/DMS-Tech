import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { deadLetters, systemOverview } from "@/server/system/overview";
import { listProblemEvents } from "@/server/system/events";
import { dismissEventAction, dismissExecutionAction, dismissOutboxDeadAction, retryEventAction, retryExecutionAction, retryOutboxDeadAction } from "@/lib/os/system-actions";
import { checkTone, execTone, jobTone } from "@/lib/os/system-page";
import { Badge, EmptyState, flatParams, fmtDateTime, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "System health" };
const TABS = ["overview", "jobs", "events", "dead", "backups", "metrics"] as const;

export default async function SystemHealthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!can(ctx, "system.health.view")) return <PermissionDenied permission="system.health.view" />;
  const sp = flatParams(await searchParams);
  const t = await getTranslations("os.system");
  const locale = await getLocale();
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "overview";
  const d = await systemOverview(ctx);
  const dead = tab === "dead" ? await deadLetters(ctx) : null;
  const evView = sp.view === "dead" || sp.view === "pending" ? sp.view : "failed";
  const events = tab === "events" ? await listProblemEvents(ctx, { view: evView }) : null;
  const dt = (x: Date | string | null | undefined) => (x ? fmtDateTime(x, locale) : "—");
  const n = (o: Record<string, number>, ...k: string[]) => k.reduce((a, x) => a + (o[x] ?? 0), 0);
  const unhealthyJobs = d.jobs.filter((j) => j.state !== "HEALTHY");

  return (
    <div className="grid gap-5">
      <PageHeader icon="Gauge" title={t("health.title")} subtitle={t("health.subtitle")} />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-os-line px-4 py-3 text-xs">
        <Badge tone={d.ready.ready ? "success" : "danger"} dot>{d.ready.ready ? t("health.ready") : t("health.notReady")}</Badge>
        <span className="text-os-muted" dir="ltr">v{d.build.version}{d.build.commit ? ` · ${d.build.commit.slice(0, 10)}` : ""} · {d.build.environment}{d.build.builtAt ? ` · ${d.build.builtAt.slice(0, 16).replace("T", " ")}` : ""}</span>
        {d.config.localProdTest && <Badge tone="warning">{t("health.localProdTest")}</Badge>}
        <span className="ms-auto text-os-faint">{t("health.checkedAt")} {dt(d.ready.time)}</span>
      </div>
      {d.alerts.length > 0 && (
        <ul className="grid gap-1">
          {d.alerts.map((a) => (
            <li key={a.kind}>
              <Link href={a.href} className={`block rounded-lg border px-4 py-2 text-xs ${a.severity === "URGENT" ? "border-danger/40 bg-danger/10 text-danger" : "border-warning/40 bg-warning/10 text-warning"}`}>
                {locale === "ar" ? a.ar : a.en}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav className="flex flex-wrap gap-1">
        {TABS.filter((x) => x !== "backups" || d.canBackups).map((x) => (
          <Link key={x} href={`?tab=${x}`} className={`rounded-full border px-3 py-1 text-xs ${tab === x ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
            {t(`health.tab.${x}` as "health.tab.overview")}
            {x === "jobs" && unhealthyJobs.length > 0 && <span className="ms-1 text-warning">{unhealthyJobs.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t("health.dependencies")}>
            <ul className="divide-y divide-os-line">
              {d.ready.checks.map((c) => (
                <li key={c.name} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    {t.has(`health.check.${c.name}`) ? t(`health.check.${c.name}` as "health.check.database") : c.name}
                    {c.detail && <span className="block break-words text-[11px] text-os-faint" dir="ltr">{c.detail}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {c.ms !== undefined && <span className="text-[11px] text-os-faint tabular" dir="ltr">{c.ms} ms</span>}
                    <Badge tone={checkTone(c.status)}>{t(`health.cs.${c.status}` as "health.cs.ok")}</Badge>
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-4 py-2 text-[11px] text-os-faint">{t("health.optionalNote")}</p>
          </SectionCard>
          <SectionCard title={t("health.queues")}>
            <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
              {[
                [t("health.q.outboxPending"), n(d.queues.outbox, "PENDING", "PROCESSING", "FAILED")],
                [t("health.q.outboxDead"), n(d.queues.outbox, "DEAD_LETTER")],
                [t("health.q.eventsFailed"), n(d.events, "FAILED")],
                [t("health.q.eventsDead"), n(d.events, "DEAD_LETTER")],
                [t("health.q.eventsStale"), d.events.stalePending],
                [t("health.q.automationFailed"), n(d.automation, "FAILED", "DEAD_LETTER")],
                [t("health.q.integrationsError"), n(d.integrations, "ERROR", "DEGRADED")],
                [t("health.q.integrationsConnected"), n(d.integrations, "CONNECTED")]
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg border border-os-line p-2">
                  <dt className="text-[11px] text-os-muted">{k}</dt>
                  <dd className="text-lg font-semibold tabular">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="px-4 pb-3 text-[11px] text-os-faint">{t("health.oldestDue")}: {dt(d.queues.oldestDueAt)}</p>
          </SectionCard>
          <SectionCard title={t("health.jobsSummary")}>
            <ul className="divide-y divide-os-line">
              {d.jobs.map((j) => (
                <li key={j.name} className="flex items-center justify-between gap-2 px-4 py-1.5 text-xs">
                  <span dir="ltr">{j.name}</span>
                  <Badge tone={jobTone(j.state)}>{t(`health.js.${j.state}` as "health.js.HEALTHY")}</Badge>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title={t("health.platform")}>
            <dl className="grid gap-2 p-4 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-os-muted">{t("health.lastBackup")}</dt><dd>{d.lastBackup ? `${dt(d.lastBackup.at)} · ${d.lastBackup.status}` : <span className="text-warning">{t("health.none")}</span>}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-os-muted">{t("health.lastVerified")}</dt><dd>{d.lastVerified ? dt(d.lastVerified) : <span className="text-warning">{t("health.none")}</span>}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-os-muted">{t("health.migrations")}</dt><dd dir="ltr">{d.ready.checks.find((c) => c.name === "migrations")?.detail ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-os-muted">{t("health.errorTracking")}</dt><dd>{d.reporter.configured ? d.reporter.name : <span className="text-warning">{t("health.notConfigured")}</span>}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-os-muted">{t("health.config")}</dt><dd className="max-w-[60%] break-words text-end" dir="ltr">{d.config.issues.length ? d.config.issues.map((i) => `${i.level === "critical" ? "✖" : "!"} ${i.key}:${i.code}`).join(" · ") : "ok"}</dd></div>
            </dl>
          </SectionCard>
        </div>
      )}

      {tab === "jobs" && (
        <div className="os-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("health.job")}</th><th>{t("f.status")}</th><th className="hidden md:table-cell">{t("health.lastSuccess")}</th><th className="hidden md:table-cell">{t("health.heartbeat")}</th><th className="hidden lg:table-cell text-end">{t("health.duration")}</th><th className="hidden lg:table-cell">{t("detail")}</th></tr></thead>
              <tbody>
                {d.jobs.map((j) => (
                  <tr key={j.name}>
                    <td className="text-xs"><span dir="ltr">{j.name}</span><span className="block text-[11px] text-os-faint" dir="ltr">{j.command} · {t("health.every")} {Math.round(j.everyMs / 60000)} min{j.instances > 1 ? ` · ${j.instances} keys` : ""}</span></td>
                    <td><Badge tone={jobTone(j.state)}>{t(`health.js.${j.state}` as "health.js.HEALTHY")}</Badge></td>
                    <td className="hidden whitespace-nowrap text-xs md:table-cell">{dt(j.lastSucceededAt)}</td>
                    <td className="hidden whitespace-nowrap text-xs md:table-cell">{dt(j.heartbeatAt)}</td>
                    <td className="hidden text-end text-xs tabular lg:table-cell" dir="ltr">{j.lastDurationMs ?? "—"} ms · {j.runCount}/{j.failCount}</td>
                    <td className="hidden max-w-[280px] break-words text-[11px] text-os-muted lg:table-cell" dir="ltr">{j.reason || j.lastError || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-os-faint">{t("health.jobsNote")}</p>
        </div>
      )}

      {tab === "events" && events && (
        <>
          <nav className="flex gap-3 text-xs">
            {(["failed", "dead", "pending"] as const).map((v) => (
              <Link key={v} href={`?tab=events&view=${v}`} className={evView === v ? "text-iris-light" : "text-os-muted hover:text-os-text"}>{t(`health.ev.${v}` as "health.ev.failed")}</Link>
            ))}
          </nav>
          <div className="os-card overflow-hidden">
            {events.length === 0 ? (
              <EmptyState icon="Gauge" title={t("health.noEvents")} text={t("health.noEventsText")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="os-table">
                  <thead><tr><th>{t("event")}</th><th>{t("f.status")}</th><th className="hidden md:table-cell">{t("detail")}</th><th /></tr></thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td className="text-xs"><span dir="ltr">{e.type}</span><span className="block text-[11px] text-os-faint">{dt(e.createdAt)} · {t("attempts")} {e.attempts}{e.depth ? ` · ${t("depth")} ${e.depth}` : ""}</span></td>
                        <td><Badge tone={execTone(e.status === "DEAD_LETTER" ? "DEAD_LETTER" : e.status === "FAILED" ? "FAILED" : "PENDING")}>{e.status}</Badge></td>
                        <td className="hidden max-w-[360px] break-words text-[11px] text-os-muted md:table-cell" dir="ltr">{e.error ?? "—"}{Array.isArray(e.handlersDone) && (e.handlersDone as string[]).length ? ` · ✓ ${(e.handlersDone as string[]).join(", ")}` : ""}</td>
                        <td className="whitespace-nowrap">
                          {d.canRetryEvents && e.status !== "PENDING" && (
                            <span className="flex gap-1">
                              <RunButton action={retryEventAction} args={[e.id]} label={t("retry")} className="os-btn-ghost text-xs" />
                              <ActionForm action={dismissEventAction} args={[e.id]} trigger={t("dismiss")} triggerClass="os-btn-ghost text-xs" submitLabel={t("dismiss")} fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: true }]} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "dead" && dead && (
        <div className="os-card overflow-hidden">
          {dead.items.length === 0 ? (
            <EmptyState icon="Gauge" title={t("health.noDead")} text={t("health.noDeadText")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead><tr><th>{t("health.source")}</th><th>{t("f.status")}</th><th className="hidden md:table-cell">{t("detail")}</th><th /></tr></thead>
                <tbody>
                  {dead.items.map((x) => (
                    <tr key={`${x.source}-${x.id}`}>
                      <td className="text-xs">{t(`health.src.${x.source}` as "health.src.event")}<span className="block text-[11px] text-os-faint" dir="ltr">{x.title} · {dt(x.at)}</span></td>
                      <td><Badge tone={execTone(x.status)}>{x.status}</Badge></td>
                      <td className="hidden max-w-[360px] break-words text-[11px] text-os-muted md:table-cell" dir="ltr">{x.error ?? "—"}</td>
                      <td className="whitespace-nowrap">
                        {dead.can[x.source] && (
                          <span className="flex gap-1">
                            <RunButton action={x.source === "integration" ? retryOutboxDeadAction : x.source === "automation" ? retryExecutionAction : retryEventAction} args={[x.id]} label={t("retry")} className="os-btn-ghost text-xs" />
                            <ActionForm action={x.source === "integration" ? dismissOutboxDeadAction : x.source === "automation" ? dismissExecutionAction : dismissEventAction} args={[x.id]} trigger={t("dismiss")} triggerClass="os-btn-ghost text-xs" submitLabel={t("dismiss")} fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: true }]} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "backups" && d.backups && (
        <div className="os-card overflow-hidden">
          {d.backups.length === 0 ? (
            <EmptyState icon="Gauge" title={t("health.noBackups")} text={t("health.noBackupsText")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead><tr><th>{t("when")}</th><th>{t("f.status")}</th><th className="hidden md:table-cell">{t("health.file")}</th><th className="hidden lg:table-cell">{t("health.verified")}</th></tr></thead>
                <tbody>
                  {d.backups.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap text-xs">{dt(b.startedAt)}</td>
                      <td><Badge tone={b.status === "VERIFIED" ? "success" : b.status === "COMPLETED" ? "info" : b.status === "STARTED" ? "warning" : "danger"}>{b.status}</Badge></td>
                      <td className="hidden break-all text-[11px] md:table-cell" dir="ltr">{b.fileName ?? "—"}{b.sizeBytes ? ` · ${(b.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}{b.sha256 ? ` · sha256 ${b.sha256.slice(0, 12)}…` : ""}{b.error ? ` · ${b.error}` : ""}</td>
                      <td className="hidden text-xs lg:table-cell">{dt(b.verifiedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-2 text-[11px] text-os-faint">{t("health.backupNote")}</p>
        </div>
      )}

      {tab === "metrics" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t("health.metrics")}>
            <p className="px-4 pt-3 text-[11px] text-os-faint">{t("health.metricsNote")} {dt(d.metrics.since)}</p>
            <ul className="grid gap-1 p-4 text-xs" dir="ltr">
              {d.metrics.counters.length === 0 && <li className="text-os-muted">—</li>}
              {d.metrics.counters.map((c) => (
                <li key={c.key} className="flex justify-between gap-2"><span className="break-all">{c.key}</span><span className="tabular">{c.value}</span></li>
              ))}
              {d.metrics.timings.map((c) => (
                <li key={c.key} className="flex justify-between gap-2"><span className="break-all">{c.key}</span><span className="tabular">n={c.count} avg={c.avg} max={c.max}</span></li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title={t("health.retention")}>
            <ul className="grid gap-1 p-4 text-xs">
              {d.retention.map((r) => (
                <li key={r.key} className="flex justify-between gap-2"><span>{r.label}</span><span className="tabular">{r.days} {t("health.days")}</span></li>
              ))}
            </ul>
            <p className="px-4 text-[11px] font-medium">{t("health.neverPurged")}</p>
            <ul className="grid gap-0.5 px-4 pb-3 text-[11px] text-os-muted">
              {d.keep.map((k) => (
                <li key={k}>· {k}</li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
