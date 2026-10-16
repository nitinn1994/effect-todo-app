import { Effect, type Schema, SchemaIssue } from "effect"
import { HttpServerResponse } from "effect/http"
import type { HttpServerError } from "effect/http/HttpServerError"
import type { HttpBodyError } from "effect/http/HttpBody"
import type { DatabaseError, EmailAlreadyExists, TaskNotFound, UserNotFound } from "../errors.ts"
import type { ErrorResponse } from "../schemas.ts"

/** Every typed error a route handler is allowed to fail with. */
export type ApiError =
  | UserNotFound
  | TaskNotFound
  | EmailAlreadyExists
  | DatabaseError
  | Schema.SchemaError
  | HttpServerError
  | HttpBodyError

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

/** Turns a schema failure into lines like `email: must be a valid email address`. */
const validationDetails = (error: Schema.SchemaError): Array<string> =>
  formatIssues(error.issue).issues.map(({ message, path }) => {
    const field = (path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment)).join(".")
    return field.length > 0 ? `${field}: ${message}` : message
  })

const reply = (status: number, body: ErrorResponse) => HttpServerResponse.jsonUnsafe(body, { status })

/**
 * Maps a typed error to an HTTP response.
 *
 * Client mistakes get a helpful message. Server failures are logged in full
 * but the client only sees a generic message, so internals (SQL, stack
 * traces, file paths) never leak.
 */
export const toErrorResponse = (error: ApiError): Effect.Effect<HttpServerResponse.HttpServerResponse> => {
  switch (error._tag) {
    case "SchemaError":
      return Effect.succeed(reply(400, {
        error: "ValidationError",
        message: "The request is invalid",
        details: validationDetails(error)
      }))
    case "HttpServerError":
      // Raised when the body is not valid JSON.
      return Effect.succeed(reply(400, { error: "BadRequest", message: "The request body could not be parsed" }))
    case "UserNotFound":
      return Effect.succeed(reply(404, { error: "NotFound", message: `User ${error.userId} was not found` }))
    case "TaskNotFound":
      return Effect.succeed(
        reply(404, { error: "NotFound", message: `Task ${error.taskId} was not found for user ${error.userId}` })
      )
    case "EmailAlreadyExists":
      return Effect.succeed(reply(409, { error: "Conflict", message: `Email ${error.email} is already in use` }))
    case "DatabaseError":
    case "HttpBodyError":
      return Effect.logError("Unexpected server error", error).pipe(
        Effect.as(reply(500, { error: "InternalServerError", message: "Something went wrong" }))
      )
  }
}

/** Wraps a route handler so all of its typed errors become JSON error responses. */
export const handle = <R>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, ApiError, R>
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> => Effect.catch(effect, toErrorResponse)
