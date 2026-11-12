import type { ReactNode } from "react";
import type { getTranslations } from "next-intl/server";
import type { Ctx } from "@/server/context";
import type { getEmployee } from "@/server/hr/employees";
import type { compensationHistory } from "@/server/hr/compensation";

type EmployeeData = Awaited<ReturnType<typeof getEmployee>>;

/** labels for the identity fields (kept inline; the shared message files stay untouched) */
export const ID_T = {
  ar: { gender: "الجنس", MALE: "ذكر", FEMALE: "أنثى", birthDate: "تاريخ الميلاد", age: (n: number) => `${n} سنة`, nationalId: "رقم الهوية / الإقامة" },
  en: { gender: "Gender", MALE: "Male", FEMALE: "Female", birthDate: "Date of birth", age: (n: number) => `${n} years`, nationalId: "National ID / iqama no." }
};

/** Everything the employee page resolves once and every tab reads (no extra queries). */
export type EmployeeTabCtx = {
  ctx: Ctx;
  id: string;
  d: EmployeeData;
  e: EmployeeData["employee"];
  c: EmployeeData["can"];
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<"os.hr">>>;
  today: Date;
  org: { timezone: string; currency: string };
  it: (typeof ID_T)["ar"];
  ageOf: (b: Date) => number;
  /** fetched by the page (only on the compensation tab, when permitted) to keep the original query order */
  comp: Awaited<ReturnType<typeof compensationHistory>>;
  m: (v: { toFixed(n: number): string } | string, cur?: string) => string;
  row: (k: string, v: ReactNode) => ReactNode;
};
