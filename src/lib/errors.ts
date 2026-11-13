// Errors that are safe to show to the user. Anything else is treated as an
// internal error: logged in full, shown to the user as a generic message.

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT";

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Message shown to the user. Keep it friendly and free of internals. */
  readonly publicMessage: string;

  constructor(code: ErrorCode, publicMessage: string, options?: { cause?: unknown }) {
    super(publicMessage, options);
    this.name = "AppError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** HTTP status for API route handlers. */
export function statusFor(code: ErrorCode): number {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
    case "PLAN_LIMIT":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
  }
}
