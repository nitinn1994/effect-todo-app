import { Config, Context, Effect, Layer } from "effect"

/**
 * Application configuration, read once from environment variables.
 *
 * Modelling config as a service means tests can swap in their own values
 * with `AppConfig.layerWith(...)` instead of touching `process.env`.
 */
export class AppConfig extends Context.Service<AppConfig, {
  readonly port: number
  readonly databasePath: string
}>()("app/AppConfig") {
  /** Reads `PORT` and `DATABASE_PATH`, falling back to sensible defaults. */
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.gen(function*() {
      const port = yield* Config.Port("PORT").pipe(Config.withDefault(3000))
      const databasePath = yield* Config.String("DATABASE_PATH").pipe(Config.withDefault("./data/todo.db"))
      return { port, databasePath }
    })
  )

  /** Fixed configuration, handy for tests and scripts. */
  static readonly layerWith = (config: Partial<AppConfig["Service"]>) =>
    Layer.succeed(AppConfig, { port: 3000, databasePath: ":memory:", ...config })
}
