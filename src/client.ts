import { NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Task, User } from "./schemas.ts"

/**
 * Example of calling the API with Effect's typed HTTP client.
 *
 * Start the server first (`npm run dev`), then run `npm run client`.
 */
const program = Effect.gen(function*() {
  const baseUrl = yield* Config.String("API_URL").pipe(Config.withDefault("http://localhost:3000"))

  // A client that prefixes every URL and fails on non-2xx responses.
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl)),
    HttpClient.filterStatusOk
  )

  // POST /users — the response body is decoded and validated with the User schema.
  const user = yield* client.execute(
    HttpClientRequest.post("/users").pipe(
      HttpClientRequest.bodyJsonUnsafe({ name: "Grace Hopper", email: `grace+${Date.now()}@example.com` })
    )
  ).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(User)))
  yield* Effect.logInfo("Created user", user)

  // POST /users/:id/tasks
  const task = yield* client.execute(
    HttpClientRequest.post(`/users/${user.id}/tasks`).pipe(
      HttpClientRequest.bodyJsonUnsafe({ title: "Find the first bug" })
    )
  ).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Task)))
  yield* Effect.logInfo("Created task", task)

  // GET /users/:id/tasks
  const tasks = yield* client.get(`/users/${user.id}/tasks`).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Task)))
  )
  yield* Effect.logInfo(`User ${user.id} has ${tasks.length} task(s)`)
})

program.pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain)
