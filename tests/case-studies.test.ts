import { afterEach, describe, expect, it, vi } from "vitest";
import { caseStudies, visibleCaseStudies } from "@/content/case-studies";
import { clientProjects } from "@/content/projects";
import { packageGroups } from "@/content/offers";

describe("case studies", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("drafts never reach the live site — only approved case studies show in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(visibleCaseStudies().every((c) => c.approved)).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(visibleCaseStudies()).toHaveLength(caseStudies.length);
  });

  it("each case study belongs to a real project, links to a real package and covers founding → launch → growth", () => {
    const tiers = new Set(packageGroups.flatMap((g) => g.tiers.map((t) => t.key)));
    for (const c of caseStudies) {
      expect(clientProjects.some((p) => p.slug === c.slug), c.slug).toBe(true);
      expect(tiers.has(c.package), c.package).toBe(true);
      expect(c.journey.map((j) => j.stage.en)).toEqual(["Founding", "Launch", "Growth"]);
      // outcomes are described, never invented figures
      expect(c.outcome.every((o) => !/\d/.test(o.ar) && !/\d/.test(o.en)), c.slug).toBe(true);
    }
  });
});
