type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "iris";

export const invoiceTone = (s: string): Tone =>
  s === "PAID" ? "success" : s === "OVERDUE" ? "danger" : s === "PARTIALLY_PAID" ? "warning" : s === "SENT" ? "info" : s === "ISSUED" ? "iris" : "neutral";
export const expenseTone = (s: string): Tone =>
  s === "PAID" ? "success" : s === "APPROVED" ? "info" : s === "PENDING_APPROVAL" ? "warning" : s === "REJECTED" ? "danger" : "neutral";
export const paymentTone = (s: string): Tone => (s === "REVERSED" ? "danger" : "success");
