type Tone = "neutral" | "info" | "iris" | "success" | "warning" | "danger";

export const quoteStatusTone = (s: string): Tone =>
  s === "ACCEPTED" ? "success" : s === "APPROVED" ? "iris" : s === "SENT" || s === "VIEWED" ? "info" : s === "PENDING_APPROVAL" || s === "INTERNAL_REVIEW" ? "warning" : s === "REJECTED" || s === "EXPIRED" || s === "CANCELLED" ? "danger" : "neutral";

export const contractStatusTone = (s: string): Tone =>
  s === "ACTIVE" ? "success" : s === "EXPIRING" || s === "AWAITING_SIGNATURE" || s === "INTERNAL_REVIEW" ? "warning" : s === "EXPIRED" || s === "TERMINATED" || s === "CANCELLED" ? "danger" : "neutral";
