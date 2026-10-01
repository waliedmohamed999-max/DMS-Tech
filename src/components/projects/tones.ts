type Tone = "neutral" | "info" | "iris" | "success" | "warning" | "danger";

export const projectStatusTone = (s: string): Tone =>
  s === "ACTIVE" ? "iris" : s === "COMPLETED" ? "success" : s === "AT_RISK" || s === "BLOCKED" ? "danger" : s === "WAITING_CLIENT" || s === "ON_HOLD" ? "warning" : s === "PLANNING" ? "info" : "neutral";
export const healthTone = (h: string): Tone => (h === "AT_RISK" ? "danger" : h === "NEEDS_ATTENTION" ? "warning" : "success");
export const taskStatusTone = (s: string): Tone =>
  s === "DONE" ? "success" : s === "BLOCKED" ? "danger" : s === "REVIEW" ? "warning" : s === "IN_PROGRESS" ? "iris" : s === "TODO" ? "info" : "neutral";
