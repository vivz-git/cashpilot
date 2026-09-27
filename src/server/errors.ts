/** Errors whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "validation"
      | "not_found"
      | "forbidden"
      | "unauthenticated"
      | "conflict"
      | "rate_limited"
      | "external" = "validation",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`, "not_found");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "forbidden");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please wait a moment and try again.") {
    super(message, "rate_limited");
  }
}

export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  console.error(err);
  return "Something went wrong. Please try again.";
}
