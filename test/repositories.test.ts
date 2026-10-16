/**
 * Integration tests for the SQLite repositories.
 *
 * Each test gets a brand new in-memory database with migrations applied,
 * and the connection is closed when the test's scope ends.
 */
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { AppConfig } from "../src/config.ts"
import { Database } from "../src/db/Database.ts"
import { RepositoriesLayer } from "../src/layers.ts"
import { TaskRepository } from "../src/repositories/TaskRepository.ts"
import { UserRepository } from "../src/repositories/UserRepository.ts"

const TestLayer = Layer.merge(RepositoriesLayer, Database.layer).pipe(
  Layer.provide(AppConfig.layerWith({ databasePath: ":memory:" }))
)

describe("UserRepository (SQLite)", () => {
  it.effect("creates, reads, updates and deletes a user", () =>
    Effect.gen(function*() {
      const repo = yield* UserRepository

      const created = yield* repo.create({ name: "Ada", email: "ada@example.com" })
      assert.strictEqual(created.id, 1)

      const found = yield* repo.findById(created.id)
      assert.deepStrictEqual(found, Option.some(created))

      const updated = yield* repo.update(created.id, { name: "Ada Lovelace" })
      assert.strictEqual(Option.getOrThrow(updated).name, "Ada Lovelace")

      assert.isTrue(yield* repo.delete(created.id))
      assert.isTrue(Option.isNone(yield* repo.findById(created.id)))
      assert.isFalse(yield* repo.delete(created.id))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("rejects duplicate emails, case-insensitively", () =>
    Effect.gen(function*() {
      const repo = yield* UserRepository
      yield* repo.create({ name: "Ada", email: "ada@example.com" })
      const error = yield* Effect.flip(repo.create({ name: "Imposter", email: "ADA@example.com" }))
      assert.strictEqual(error._tag, "EmailAlreadyExists")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("treats SQL in values as plain data (parameterized queries)", () =>
    Effect.gen(function*() {
      const repo = yield* UserRepository
      const name = "Robert'); DROP TABLE users;--"
      const user = yield* repo.create({ name, email: "bobby@example.com" })
      assert.strictEqual(user.name, name)
      assert.lengthOf(yield* repo.findAll, 1)
    }).pipe(Effect.provide(TestLayer)))
})

describe("TaskRepository (SQLite)", () => {
  it.effect("stores booleans and scopes tasks to their owner", () =>
    Effect.gen(function*() {
      const users = yield* UserRepository
      const tasks = yield* TaskRepository
      const ada = yield* users.create({ name: "Ada", email: "ada@example.com" })
      const alan = yield* users.create({ name: "Alan", email: "alan@example.com" })

      const task = yield* tasks.create(ada.id, { title: "Write tests", completed: true })
      assert.isTrue(task.completed)
      assert.isNull(task.description)

      // Alan cannot see or touch Ada's task.
      assert.isTrue(Option.isNone(yield* tasks.findById(alan.id, task.id)))
      assert.isFalse(yield* tasks.delete(alan.id, task.id))
      assert.lengthOf(yield* tasks.findAllByUser(alan.id), 0)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("deletes a user's tasks when the user is deleted", () =>
    Effect.gen(function*() {
      const users = yield* UserRepository
      const tasks = yield* TaskRepository
      const db = yield* Database
      const ada = yield* users.create({ name: "Ada", email: "ada@example.com" })
      yield* tasks.create(ada.id, { title: "One" })
      yield* tasks.create(ada.id, { title: "Two" })

      yield* users.delete(ada.id)
      const row = (yield* db.get("SELECT COUNT(*) AS n FROM tasks")) as { n: number }
      assert.strictEqual(row.n, 0)
    }).pipe(Effect.provide(TestLayer)))
})
