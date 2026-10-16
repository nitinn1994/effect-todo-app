import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { CreateTask, CreateUser, Task, TaskParams, UpdateTask, UpdateUser, User, UserParams } from "../schemas.ts"
import { TaskService } from "../services/TaskService.ts"
import { UserService } from "../services/UserService.ts"
import { handle } from "./errorResponse.ts"

// Response encoders: the body is validated against the schema before it is sent.
const userJson = HttpServerResponse.schemaJson(User)
const usersJson = HttpServerResponse.schemaJson(Schema.Array(User))
const taskJson = HttpServerResponse.schemaJson(Task)
const tasksJson = HttpServerResponse.schemaJson(Schema.Array(Task))

// Request decoders.
const userParams = HttpRouter.schemaPathParams(UserParams)
const taskParams = HttpRouter.schemaPathParams(TaskParams)
/** Decodes the JSON body, reporting every invalid field rather than just the first. */
const jsonBody = <A>(schema: Schema.ConstraintDecoder<A, never>) =>
  HttpServerRequest.schemaBodyJson(schema, { errors: "all" })

const HealthRoutes = HttpRouter.add("GET", "/health", HttpServerResponse.jsonUnsafe({ status: "ok" }))

const UserRoutes = HttpRouter.use(Effect.fnUntraced(function*(router) {
  const users = yield* UserService

  yield* router.add("GET", "/users", handle(users.list.pipe(Effect.flatMap((list) => usersJson(list)))))

  yield* router.add(
    "POST",
    "/users",
    handle(Effect.gen(function*() {
      const input = yield* jsonBody(CreateUser)
      const user = yield* users.create(input)
      return yield* userJson(user, { status: 201 })
    }))
  )

  yield* router.add(
    "GET",
    "/users/:userId",
    handle(Effect.gen(function*() {
      const { userId } = yield* userParams
      return yield* userJson(yield* users.get(userId))
    }))
  )

  yield* router.add(
    "PATCH",
    "/users/:userId",
    handle(Effect.gen(function*() {
      const { userId } = yield* userParams
      const input = yield* jsonBody(UpdateUser)
      return yield* userJson(yield* users.update(userId, input))
    }))
  )

  yield* router.add(
    "DELETE",
    "/users/:userId",
    handle(Effect.gen(function*() {
      const { userId } = yield* userParams
      yield* users.remove(userId)
      return HttpServerResponse.empty({ status: 204 })
    }))
  )
}))

const TaskRoutes = HttpRouter.use(Effect.fnUntraced(function*(router) {
  const tasks = yield* TaskService

  yield* router.add(
    "GET",
    "/users/:userId/tasks",
    handle(Effect.gen(function*() {
      const { userId } = yield* userParams
      return yield* tasksJson(yield* tasks.list(userId))
    }))
  )

  yield* router.add(
    "POST",
    "/users/:userId/tasks",
    handle(Effect.gen(function*() {
      const { userId } = yield* userParams
      const input = yield* jsonBody(CreateTask)
      return yield* taskJson(yield* tasks.create(userId, input), { status: 201 })
    }))
  )

  yield* router.add(
    "GET",
    "/users/:userId/tasks/:taskId",
    handle(Effect.gen(function*() {
      const { taskId, userId } = yield* taskParams
      return yield* taskJson(yield* tasks.get(userId, taskId))
    }))
  )

  yield* router.add(
    "PATCH",
    "/users/:userId/tasks/:taskId",
    handle(Effect.gen(function*() {
      const { taskId, userId } = yield* taskParams
      const input = yield* jsonBody(UpdateTask)
      return yield* taskJson(yield* tasks.update(userId, taskId, input))
    }))
  )

  yield* router.add(
    "DELETE",
    "/users/:userId/tasks/:taskId",
    handle(Effect.gen(function*() {
      const { taskId, userId } = yield* taskParams
      yield* tasks.remove(userId, taskId)
      return HttpServerResponse.empty({ status: 204 })
    }))
  )
}))

/** All HTTP routes. Still needs `UserService` and `TaskService` to be provided. */
export const ApiRoutes = Layer.mergeAll(HealthRoutes, UserRoutes, TaskRoutes)
