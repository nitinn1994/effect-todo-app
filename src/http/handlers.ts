import { Effect, Layer, Schema, SchemaIssue } from "effect"
import { HttpServerResponse } from "effect/http"
import { HttpApiBuilder, HttpApiMiddleware, HttpApiSwagger } from "effect/http-api"
import type { DatabaseError, EmailAlreadyExists, TaskNotFound, UserNotFound } from "../errors.ts"
import { TaskService } from "../services/TaskService.ts"
import { UserService } from "../services/UserService.ts"
import { Conflict, InternalServerError, NotFound, RequestValidation, TodoApi, ValidationError } from "./api.ts"

/**
 * The API *implementation*: one handler per endpoint declared in `api.ts`.
 *
 * Request bodies and params arrive already decoded and validated, and the
 * returned values are encoded with the response schema. Handlers only call
 * a service and translate domain errors into HTTP errors.
 */

// ---------------------------------------------------------------------------
// Domain errors -> HTTP errors
// ---------------------------------------------------------------------------

type DomainError = UserNotFound | TaskNotFound | EmailAlreadyExists | DatabaseError

/**
 * Maps each typed domain error to the matching HTTP error schema.
 * Server errors are logged in full, but the client only gets a generic
 * message, so SQL, stack traces and file paths never leak.
 */
const toHttpError = (error: DomainError): Effect.Effect<never, NotFound | Conflict | InternalServerError> => {
  switch (error._tag) {
    case "UserNotFound":
      return Effect.fail(new NotFound({ message: `User ${error.userId} was not found` }))
    case "TaskNotFound":
      return Effect.fail(new NotFound({ message: `Task ${error.taskId} was not found for user ${error.userId}` }))
    case "EmailAlreadyExists":
      return Effect.fail(new Conflict({ message: `Email ${error.email} is already in use` }))
    case "DatabaseError":
      return Effect.logError("Unexpected server error", error).pipe(
        Effect.andThen(Effect.fail(new InternalServerError({ message: "Something went wrong" })))
      )
  }
}

/** Which HTTP error each domain error becomes — keeps handler error types precise. */
type HttpErrorOf<E> =
  | (E extends UserNotFound | TaskNotFound ? NotFound : never)
  | (E extends EmailAlreadyExists ? Conflict : never)
  | (E extends DatabaseError ? InternalServerError : never)

/**
 * Runs a service call and converts its domain errors to HTTP errors.
 * The cast only narrows `toHttpError`'s result to the errors `E` can actually produce.
 */
const http = <A, E extends DomainError, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, HttpErrorOf<E>, R> =>
  Effect.catch(effect, toHttpError) as Effect.Effect<A, HttpErrorOf<E>, R>

// ---------------------------------------------------------------------------
// Handlers, one Layer per group
// ---------------------------------------------------------------------------

const HealthHandlers = HttpApiBuilder.group(
  TodoApi,
  "health",
  (handlers) => handlers.handle("check", () => Effect.succeed({ status: "ok" as const }))
)

const UsersHandlers = HttpApiBuilder.group(
  TodoApi,
  "users",
  Effect.fnUntraced(function*(handlers) {
    const users = yield* UserService
    return handlers
      .handle("list", () => http(users.list))
      .handle("create", ({ payload }) => http(users.create(payload)))
      .handle("get", ({ params }) => http(users.get(params.userId)))
      .handle("update", ({ params, payload }) => http(users.update(params.userId, payload)))
      .handle("remove", ({ params }) => http(users.remove(params.userId)))
  })
)

const TasksHandlers = HttpApiBuilder.group(
  TodoApi,
  "tasks",
  Effect.fnUntraced(function*(handlers) {
    const tasks = yield* TaskService
    return handlers
      .handle("list", ({ params }) => http(tasks.list(params.userId)))
      .handle("create", ({ params, payload }) => http(tasks.create(params.userId, payload)))
      .handle("get", ({ params }) => http(tasks.get(params.userId, params.taskId)))
      .handle("update", ({ params, payload }) => http(tasks.update(params.userId, params.taskId, payload)))
      .handle("remove", ({ params }) => http(tasks.remove(params.userId, params.taskId)))
  })
)

// ---------------------------------------------------------------------------
// Request validation errors -> 400 with field-level details
// ---------------------------------------------------------------------------

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

/** Turns a schema failure into lines like `email: must be a valid email address`. */
const validationDetails = (error: Schema.SchemaError): Array<string> =>
  formatIssues(error.issue).issues.map(({ message, path }) => {
    const field = (path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment)).join(".")
    return field.length > 0 ? `${field}: ${message}` : message
  })

const encodeValidationError = HttpServerResponse.schemaJson(ValidationError)

/** True when the body was not valid JSON at all (as opposed to valid JSON with bad fields). */
const isMalformedJson = (error: Schema.SchemaError) => /json/i.test(error.message)

const RequestValidationLive = HttpApiMiddleware.layerSchemaErrorTransform(RequestValidation, (error) => {
  const body = error.kind === "Payload" && isMalformedJson(error.cause)
    ? new ValidationError({ error: "BadRequest", message: "The request body could not be parsed", details: [] })
    : new ValidationError({
      error: "ValidationError",
      message: "The request is invalid",
      details: validationDetails(error.cause)
    })
  return encodeValidationError(body, { status: 400 }).pipe(Effect.orDie)
})

/**
 * The whole HTTP app, ready to be served:
 *   - every endpoint in `TodoApi`
 *   - the generated OpenAPI document at `/openapi.json`
 *   - Swagger UI at `/docs`
 *
 * Still needs `UserService` and `TaskService` to be provided.
 */
export const ApiLive = Layer.mergeAll(
  HttpApiBuilder.layer(TodoApi, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide([HealthHandlers, UsersHandlers, TasksHandlers])
  ),
  HttpApiSwagger.layer(TodoApi, { path: "/docs" })
).pipe(Layer.provide(RequestValidationLive))
