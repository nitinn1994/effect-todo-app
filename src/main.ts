import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { AppConfig } from "./config.ts"
import { ApiLive } from "./http/handlers.ts"
import { ServicesLayer } from "./layers.ts"

/**
 * Starts the HTTP server.
 *
 * `HttpRouter.serve` turns the API (plus Swagger UI) into a server layer; `NodeHttpServer`
 * provides the actual Node `http.Server`. The port comes from `AppConfig`.
 */
const HttpServerLive = Layer.unwrap(
  Effect.gen(function*() {
    const { port } = yield* AppConfig
    return NodeHttpServer.layer(createServer, { port })
  })
)

const Main = HttpRouter.serve(ApiLive).pipe(
  Layer.provide(ServicesLayer),
  Layer.provide(HttpServerLive),
  Layer.provide(AppConfig.layer)
)

// `runMain` keeps the process alive, logs failures and, on SIGINT / SIGTERM,
// interrupts the program so every finalizer (server close, DB close) runs.
Layer.launch(Main).pipe(NodeRuntime.runMain)
