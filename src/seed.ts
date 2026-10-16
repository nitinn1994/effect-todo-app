import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { AppLayer } from "./layers.ts"
import { TaskService } from "./services/TaskService.ts"
import { UserService } from "./services/UserService.ts"

/**
 * Inserts a couple of demo users and tasks.
 *
 * Runs through the same services as the API, so validation rules and
 * error handling are identical. Safe to run twice: it skips if users exist.
 */
const seed = Effect.gen(function*() {
  const users = yield* UserService
  const tasks = yield* TaskService

  if ((yield* users.list).length > 0) {
    return yield* Effect.logInfo("Database already has users, skipping seed")
  }

  const ada = yield* users.create({ name: "Ada Lovelace", email: "ada@example.com" })
  yield* tasks.create(ada.id, { title: "Write the first program", description: "For the Analytical Engine" })
  yield* tasks.create(ada.id, { title: "Publish notes", completed: true })

  const alan = yield* users.create({ name: "Alan Turing", email: "alan@example.com" })
  yield* tasks.create(alan.id, { title: "Break Enigma" })

  yield* Effect.logInfo("Seeded 2 users and 3 tasks")
})

// Providing AppLayer opens the database; it is closed again when `seed` ends.
seed.pipe(Effect.provide(AppLayer), NodeRuntime.runMain)
