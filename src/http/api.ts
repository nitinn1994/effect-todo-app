import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, OpenApi } from "effect/http-api"
import { CreateTask, CreateUser, Task, TaskParams, UpdateTask, UpdateUser, User, UserParams } from "../schemas.ts"

/**
 * The API *definition*: every endpoint's method, path, request schemas,
 * response schema and possible errors. It contains no logic.
 *
 * The same definition drives three things, so they can never drift apart:
 *   1. the server (request decoding + response encoding) — see `handlers.ts`
 *   2. the OpenAPI document at `/openapi.json`
 *   3. the Swagger UI at `/docs`
 */

// ---------------------------------------------------------------------------
// Error responses. `httpApiStatus` sets the status code for each one.
// ---------------------------------------------------------------------------

export class ValidationError extends Schema.Class<ValidationError>("ValidationError")({
  error: Schema.Literals(["ValidationError", "BadRequest"]),
  message: Schema.String,
  details: Schema.Array(Schema.String)
}, { httpApiStatus: 400, description: "The request body or path parameters are invalid" }) {}

export class NotFound extends Schema.Class<NotFound>("NotFound")({
  error: Schema.tag("NotFound"),
  message: Schema.String
}, { httpApiStatus: 404, description: "The user or task does not exist" }) {}

export class Conflict extends Schema.Class<Conflict>("Conflict")({
  error: Schema.tag("Conflict"),
  message: Schema.String
}, { httpApiStatus: 409, description: "The email address is already in use" }) {}

export class InternalServerError extends Schema.Class<InternalServerError>("InternalServerError")({
  error: Schema.tag("InternalServerError"),
  message: Schema.String
}, { httpApiStatus: 500, description: "Unexpected server error (details are only logged on the server)" }) {}

/**
 * Middleware that turns request-decoding failures into a `ValidationError`
 * body. Declaring the error here also documents the 400 response on every
 * endpoint in Swagger.
 */
export class RequestValidation extends HttpApiMiddleware.Service<RequestValidation>()("app/RequestValidation", {
  error: ValidationError
}) {}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const Health = Schema.Struct({ status: Schema.Literal("ok") })

export class HealthGroup extends HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("check", "/health", { success: Health })
      .annotate(OpenApi.Summary, "Health check")
  )
  .annotate(OpenApi.Description, "Liveness probe")
{}

export class UsersGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("list", "/users", {
      success: Schema.Array(User),
      error: InternalServerError
    }).annotate(OpenApi.Summary, "List all users"),
    HttpApiEndpoint.post("create", "/users", {
      payload: CreateUser,
      success: User.pipe(HttpApiSchema.status(201)).annotate({ identifier: "UserCreated" }),
      error: [Conflict, InternalServerError]
    }).annotate(OpenApi.Summary, "Create a user"),
    HttpApiEndpoint.get("get", "/users/:userId", {
      params: UserParams,
      success: User,
      error: [NotFound, InternalServerError]
    }).annotate(OpenApi.Summary, "Get a user"),
    HttpApiEndpoint.patch("update", "/users/:userId", {
      params: UserParams,
      payload: UpdateUser,
      success: User,
      error: [NotFound, Conflict, InternalServerError]
    }).annotate(OpenApi.Summary, "Update a user"),
    HttpApiEndpoint.delete("remove", "/users/:userId", {
      params: UserParams,
      success: HttpApiSchema.NoContent,
      error: [NotFound, InternalServerError]
    }).annotate(OpenApi.Summary, "Delete a user and all of their tasks")
  )
  .annotate(OpenApi.Description, "Manage users")
{}

export class TasksGroup extends HttpApiGroup.make("tasks")
  .add(
    HttpApiEndpoint.get("list", "/users/:userId/tasks", {
      params: UserParams,
      success: Schema.Array(Task),
      error: [NotFound, InternalServerError]
    }).annotate(OpenApi.Summary, "List a user's tasks"),
    HttpApiEndpoint.post("create", "/users/:userId/tasks", {
      params: UserParams,
      payload: CreateTask,
      success: Task.pipe(HttpApiSchema.status(201)).annotate({ identifier: "TaskCreated" }),
      error: [NotFound, InternalServerError]
    }).annotate(OpenApi.Summary, "Create a task"),
    HttpApiEndpoint.get("get", "/users/:userId/tasks/:taskId", {
      params: TaskParams,
      success: Task,
      error: [NotFound, InternalServerError]
    }).annotate(OpenApi.Summary, "Get a task"),
    HttpApiEndpoint.patch("update", "/users/:userId/tasks/:taskId", {
      params: TaskParams,
      payload: UpdateTask,
      success: Task,
      error: [NotFound, InternalServerError]
    }).annotate(OpenApi.Summary, "Update a task"),
    HttpApiEndpoint.delete("remove", "/users/:userId/tasks/:taskId", {
      params: TaskParams,
      success: HttpApiSchema.NoContent,
      error: [NotFound, InternalServerError]
    }).annotate(OpenApi.Summary, "Delete a task")
  )
  .annotate(OpenApi.Description, "Manage a user's to-do tasks")
{}

export class TodoApi extends HttpApi.make("todo-api")
  .add(HealthGroup, UsersGroup, TasksGroup)
  .middleware(RequestValidation)
  .annotateMerge(OpenApi.annotations({
    title: "Effect To-Do API",
    version: "1.0.0",
    description: "A small REST API for users and their to-do tasks, built with TypeScript, Effect and SQLite."
  }))
{}
