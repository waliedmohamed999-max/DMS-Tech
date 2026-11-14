import { describe, expect, it } from "vitest";
import { HERO_COUNT, heroOrder, splitHeroKpis } from "@/lib/os/home-layout";

const k = (...keys: string[]) => keys.map((key) => ({ key }));
const ALL = k("invoiced", "collected", "receivables", "expenses", "overdueInvoices", "overdueAmount", "mrr", "activeLeads", "openOpps", "pipeline", "wonThisMonth", "overdueFollowUps", "activeProjects", "projectsAtRisk", "myUrgentTasks", "pendingApprovals", "activeEmployees");

describe("command center hero KPIs", () => {
  it("picks role-specific heroes in the role's order", () => {
    expect(splitHeroKpis(ALL, ["sales_manager"]).hero.map((x) => x.key)).toEqual(["pipeline", "activeLeads", "overdueFollowUps", "wonThisMonth"]);
    expect(splitHeroKpis(ALL, ["accountant"]).hero.map((x) => x.key)).toEqual(["receivables", "overdueAmount", "collected", "mrr"]);
    expect(splitHeroKpis(ALL, ["project_manager"]).hero.map((x) => x.key)).toEqual(["projectsAtRisk", "activeProjects", "myUrgentTasks", "pendingApprovals"]);
  });

  it("uses the highest-priority role when the viewer has several", () => {
    expect(heroOrder(["employee", "finance_manager"])).toEqual(heroOrder(["finance_manager"]));
    expect(heroOrder(["sales_rep", "ceo"])).toEqual(heroOrder(["ceo"]));
  });

  it("never drops a KPI: hero + rest is exactly the permitted list", () => {
    for (const roles of [["ceo"], ["sales_rep"], ["hr_manager"], ["employee"], ["some_custom_role"], []]) {
      const { hero, rest } = splitHeroKpis(ALL, roles);
      expect(hero.length).toBe(HERO_COUNT);
      expect([...hero, ...rest].map((x) => x.key).sort()).toEqual(ALL.map((x) => x.key).sort());
    }
  });

  it("only shows what the service returned, and fills empty slots from the remaining cards", () => {
    const permitted = k("myUrgentTasks", "activeLeads", "team");
    const { hero, rest } = splitHeroKpis(permitted, ["finance_manager"]);
    expect(hero.map((x) => x.key)).toEqual(["myUrgentTasks", "activeLeads", "team"]);
    expect(rest).toEqual([]);
  });
});
