import { Data } from "effect"

/**
 * Typed domain errors.
 *
 * Each error carries a `_tag`, so callers can handle them precisely with
 * `Effect.catchTag("UserNotFound", ...)` and the compiler tracks which
 * errors every function can fail with.
 */

export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: number
}> {}

export class TaskNotFound extends Data.TaggedError("TaskNotFound")<{
  readonly userId: number
  readonly taskId: number
}> {}

export class EmailAlreadyExists extends Data.TaggedError("EmailAlreadyExists")<{
  readonly email: string
}> {}

/** Anything unexpected that happened while talking to SQLite. */
export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
