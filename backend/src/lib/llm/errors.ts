// Thrown when an AI call is refused before it is sent - by a spend limit or by
// the teacher having no active plan. Callers must not fall back to canned
// output or charge credits for it; the API turns it into a clean 503/402.
export class AiLimitError extends Error {
  readonly code: string = "ai_limit_reached";
  constructor(
    readonly reason: string,
    readonly limitKey: string | undefined,
    message: string
  ) {
    super(message);
    this.name = "AiLimitError";
  }
}

// An individual teacher whose trial or plan has ended (or who never had one).
// No wording about where to buy: the app must not steer users to an outside
// payment page (Google Play payments policy).
export class PlanExpiredError extends AiLimitError {
  constructor(readonly status: "expired" | "none" | "cancelled") {
    super(
      "plan_expired",
      undefined,
      status === "none"
        ? "You don't have an active plan, so AI features are paused."
        : status === "cancelled"
          ? "Your plan has been cancelled, so AI features are paused."
          : "Your plan has ended, so AI features are paused."
    );
    this.name = "PlanExpiredError";
  }
}
