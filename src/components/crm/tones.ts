import type { Tone } from "@/components/os/ui";

export const leadStatusTone = (s: string): Tone => (({ OPEN: "info", QUALIFIED: "iris", CONVERTED: "success", LOST: "danger", ARCHIVED: "neutral" }) as Record<string, Tone>)[s] ?? "neutral";
export const oppStatusTone = (s: string): Tone => (({ OPEN: "info", WON: "success", LOST: "danger", ARCHIVED: "neutral" }) as Record<string, Tone>)[s] ?? "neutral";
export const clientStatusTone = (s: string): Tone => (({ PROSPECT: "info", ACTIVE: "success", INACTIVE: "neutral", ARCHIVED: "neutral" }) as Record<string, Tone>)[s] ?? "neutral";
