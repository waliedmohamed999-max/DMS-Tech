"use client";

export type Opt = { id: string; label: string };
/** fallback only — pages pass the company's calendar day (org timezone) as `today` */
export const localToday = () => new Date().toISOString().slice(0, 10);

export function Err({ e }: { e: string | null }) {
  return e ? <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{e}</p> : null;
}
