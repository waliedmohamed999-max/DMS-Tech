/**
 * Command Center hero KPIs. The viewer's role only decides ORDER and SELECTION:
 * the list passed in is already permission-filtered by the dashboard service, so a
 * key the viewer may not see is simply never present. Everything not picked as a
 * hero stays reachable under "all indicators".
 */

export const HERO_COUNT = 4;

const SALES = ["pipeline", "activeLeads", "overdueFollowUps", "wonThisMonth", "openOpps", "quotesAwaiting"];
const FINANCE = ["receivables", "overdueAmount", "collected", "mrr", "invoiced", "overdueInvoices"];
const DELIVERY = ["projectsAtRisk", "activeProjects", "myUrgentTasks", "pendingApprovals"];
const PEOPLE = ["activeEmployees", "pendingApprovals", "myUrgentTasks", "team"];
const EXECUTIVE = ["collected", "overdueAmount", "wonThisMonth", "mrr", "pipeline", "projectsAtRisk", "pendingApprovals"];
const PERSONAL = ["myUrgentTasks", "pendingApprovals", "activeProjects"];

/** Highest-priority role first: a viewer with several roles gets the first match. */
const ROLE_LAYOUTS: [role: string, keys: string[]][] = [
  ["super_admin", EXECUTIVE],
  ["ceo", EXECUTIVE],
  ["general_manager", EXECUTIVE],
  ["finance_manager", FINANCE],
  ["accountant", FINANCE],
  ["sales_manager", SALES],
  ["project_manager", DELIVERY],
  ["hr_manager", PEOPLE],
  ["operations_manager", ["openTickets", "pendingProcurement", "pendingApprovals", "myUrgentTasks"]],
  ["sales_rep", ["overdueFollowUps", "activeLeads", "pipeline", "wonThisMonth", "openOpps"]],
  ["line_manager", PERSONAL],
  ["employee", PERSONAL]
];

/** Preferred hero order for a set of role keys; custom roles fall back to the executive cross-section. */
export function heroOrder(roleKeys: readonly string[]): string[] {
  return ROLE_LAYOUTS.find(([role]) => roleKeys.includes(role))?.[1] ?? EXECUTIVE;
}

/**
 * Split KPIs into hero cards and the rest. Heroes follow the role's preferred order;
 * when the role's list yields fewer than HERO_COUNT, the remaining slots are filled in
 * the service's own order so no viewer gets a half-empty row while cards sit hidden.
 */
export function splitHeroKpis<T extends { key: string }>(kpis: readonly T[], roleKeys: readonly string[]): { hero: T[]; rest: T[] } {
  const byKey = new Map(kpis.map((k) => [k.key, k]));
  const hero: T[] = [];
  for (const key of heroOrder(roleKeys)) {
    const k = byKey.get(key);
    if (k && hero.length < HERO_COUNT) hero.push(k);
  }
  for (const k of kpis) {
    if (hero.length >= HERO_COUNT) break;
    if (!hero.includes(k)) hero.push(k);
  }
  return { hero, rest: kpis.filter((k) => !hero.includes(k)) };
}
