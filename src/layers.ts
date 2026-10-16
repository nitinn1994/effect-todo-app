import { Layer } from "effect"
import { AppConfig } from "./config.ts"
import { Database } from "./db/Database.ts"
import { TaskRepository } from "./repositories/TaskRepository.ts"
import { UserRepository } from "./repositories/UserRepository.ts"
import { TaskService } from "./services/TaskService.ts"
import { UserService } from "./services/UserService.ts"

/**
 * The dependency graph, built bottom-up:
 *
 *   AppConfig -> Database -> UserRepository, TaskRepository -> UserService, TaskService
 *
 * `Layer.provide` feeds the layer on the right into the layer on the left.
 * Each layer is built once and shared, so there is exactly one DB connection.
 */
export const RepositoriesLayer = Layer.mergeAll(UserRepository.layer, TaskRepository.layer).pipe(
  Layer.provide(Database.layer)
)

export const ServicesLayer = Layer.mergeAll(UserService.layer, TaskService.layer).pipe(
  Layer.provide(RepositoriesLayer)
)

/** Everything the routes need, with real config from the environment. */
export const AppLayer = ServicesLayer.pipe(Layer.provide(AppConfig.layer))
