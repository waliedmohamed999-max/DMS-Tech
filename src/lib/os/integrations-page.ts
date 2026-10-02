type Tone = "neutral" | "iris" | "success" | "warning" | "danger" | "info";
export const integrationTone = (s: string): Tone => (s === "CONNECTED" ? "success" : s === "DEGRADED" ? "warning" : s === "ERROR" ? "danger" : s === "CONFIGURED" ? "info" : "neutral");
export const outboxTone = (s: string): Tone => (s === "SUCCEEDED" || s === "PROCESSED" ? "success" : s === "FAILED" || s === "PROCESSING" || s === "PENDING" ? "warning" : s === "DEAD_LETTER" || s === "REJECTED" ? "danger" : "neutral");
export const campaignTone = (s: string): Tone => (s === "COMPLETED" ? "success" : s === "RUNNING" ? "info" : s === "READY" ? "iris" : s === "PAUSED" ? "warning" : s === "FAILED" ? "danger" : "neutral");
export const recipientTone = (s: string): Tone => (s === "READ" || s === "REPLIED" || s === "DELIVERED" ? "success" : s === "SENT" ? "info" : s === "FAILED" ? "danger" : s === "SKIPPED" ? "neutral" : "warning");
export const matchTone = (s: string): Tone => (s === "MATCHED" ? "success" : s === "AMBIGUOUS" ? "warning" : "neutral");
export const consentTone = (s: string): Tone => (s === "OPTED_IN" ? "success" : s === "OPTED_OUT" || s === "BLOCKED" ? "danger" : "neutral");
