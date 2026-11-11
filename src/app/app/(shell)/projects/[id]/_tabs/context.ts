import type { getTranslations } from "next-intl/server";
import type { Ctx } from "@/server/context";
import type { getProject } from "@/server/projects/projects";

type ProjectData = Awaited<ReturnType<typeof getProject>>;
type Person = { name: string; nameAr: string | null } | null | undefined;
type Option = { id: string; label: string };

export type Reason = { code: string; severity: string; cause: string; params: Record<string, string | number> };

/** Everything the project page resolves once and every tab reads (no extra queries). */
export type ProjectTabCtx = {
  ctx: Ctx;
  id: string;
  sp: Record<string, string | undefined>;
  p: ProjectData["project"];
  access: ProjectData["access"];
  commercial: ProjectData["commercial"];
  today: Date;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<"os.projects">>>;
  name: (u: Person) => string;
  reasons: Reason[];
  reasonText: (r: Reason) => string;
  members: Option[];
  milestoneOpts: Option[];
  mgr: ProjectData["access"]["manager"];
  closed: boolean;
  clientDeps: ProjectData["project"]["dependencies"];
  people: Option[];
  query: string;
};
