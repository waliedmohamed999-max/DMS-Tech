/** Typed domain errors. Server actions map them to user-facing states. */
export class AppError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED",
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Authentication required");
export const forbidden = (permission?: string) => new AppError("FORBIDDEN", `Missing permission${permission ? `: ${permission}` : ""}`, { permission });
export const notFound = (entity: string) => new AppError("NOT_FOUND", `${entity} not found`);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const invalid = (message: string, details?: unknown) => new AppError("VALIDATION", message, details);
export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
