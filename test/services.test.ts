/**
 * Unit tests for the services.
 *
 * The repositories are replaced with small in-memory fakes, so these tests
 * run without SQLite and only exercise the business rules.
 */
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Layer, Option } from "effect"
import { EmailAlreadyExists, TaskNotFound, UserNotFound } from "../src/errors.ts"
import { TaskRepository } from "../src/repositories/TaskRepository.ts"
import { UserRepository } from "../src/repositories/UserRepository.ts"
import type { Task, User } from "../src/schemas.ts"
import { TaskService } from "../src/services/TaskService.ts"
import { UserService } from "../src/services/UserService.ts"

const now = "2026-01-01T00:00:00.000Z"
const ada: User = { id: 1, name: "Ada", email: "ada@example.com", createdAt: now, updatedAt: now }
const task: Task = {
  id: 10,
  userId: 1,
  title: "Write tests",
  description: null,
  completed: false,
  createdAt: now,
  updatedAt: now
}

/** A fake UserRepository that knows about exactly one user: Ada. */
const FakeUserRepository = Layer.succeed(UserRepository, {
  findAll: Effect.succeed([ada]),
  findById: (id) => Effect.succeed(id === ada.id ? Option.some(ada) : Option.none()),
  create: (input) =>
    input.email === ada.email
      ? Effect.fail(new EmailAlreadyExists({ email: input.email }))
      : Effect.succeed({ ...ada, id: 2, ...input }),
  update: (id, input) => Effect.succeed(id === ada.id ? Option.some({ ...ada, ...input }) : Option.none()),
  delete: (id) => Effect.succeed(id === ada.id)
})

/** A fake TaskRepository that knows about exactly one task, owned by Ada. */
const FakeTaskRepository = Layer.succeed(TaskRepository, {
  findAllByUser: (userId) => Effect.succeed(userId === ada.id ? [task] : []),
  findById: (userId, taskId) => Effect.succeed(userId === task.userId && taskId === task.id ? Option.some(task) : Option.none()),
  create: (userId, input) => Effect.succeed({ ...task, id: 11, userId, title: input.title }),
  update: (userId, taskId, input) =>
    Effect.succeed(userId === task.userId && taskId === task.id ? Option.some({ ...task, ...input }) : Option.none()),
  delete: (userId, taskId) => Effect.succeed(userId === task.userId && taskId === task.id)
})

const TestLayer = Layer.mergeAll(UserService.layer, TaskService.layer).pipe(
  Layer.provide(Layer.mergeAll(FakeUserRepository, FakeTaskRepository))
)

describe("UserService", () => {
  it.effect("returns an existing user", () =>
    Effect.gen(function*() {
      const users = yield* UserService
      const user = yield* users.get(1)
      assert.deepStrictEqual(user, ada)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("fails with UserNotFound for an unknown id", () =>
    Effect.gen(function*() {
      const users = yield* UserService
      const exit = yield* Effect.exit(users.get(42))
      assert.deepStrictEqual(exit, Exit.fail(new UserNotFound({ userId: 42 })))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("normalises email to lower case on create", () =>
    Effect.gen(function*() {
      const users = yield* UserService
      const user = yield* users.create({ name: "Grace", email: "Grace@Example.com" })
      assert.strictEqual(user.email, "grace@example.com")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("propagates EmailAlreadyExists from the repository", () =>
    Effect.gen(function*() {
      const users = yield* UserService
      const error = yield* Effect.flip(users.create({ name: "Ada 2", email: "ADA@example.com" }))
      assert.strictEqual(error._tag, "EmailAlreadyExists")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("fails with UserNotFound when deleting an unknown user", () =>
    Effect.gen(function*() {
      const users = yield* UserService
      const error = yield* Effect.flip(users.remove(42))
      assert.instanceOf(error, UserNotFound)
    }).pipe(Effect.provide(TestLayer)))
})

describe("TaskService", () => {
  it.effect("lists tasks for an existing user", () =>
    Effect.gen(function*() {
      const tasks = yield* TaskService
      assert.deepStrictEqual(yield* tasks.list(1), [task])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("fails with UserNotFound when the user does not exist", () =>
    Effect.gen(function*() {
      const tasks = yield* TaskService
      const error = yield* Effect.flip(tasks.create(42, { title: "Nope" }))
      assert.deepStrictEqual(error, new UserNotFound({ userId: 42 }))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("fails with TaskNotFound when the task does not exist", () =>
    Effect.gen(function*() {
      const tasks = yield* TaskService
      const error = yield* Effect.flip(tasks.update(1, 99, { completed: true }))
      assert.deepStrictEqual(error, new TaskNotFound({ userId: 1, taskId: 99 }))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("updates an existing task", () =>
    Effect.gen(function*() {
      const tasks = yield* TaskService
      const updated = yield* tasks.update(1, 10, { completed: true })
      assert.isTrue(updated.completed)
    }).pipe(Effect.provide(TestLayer)))
})
