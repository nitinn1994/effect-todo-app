import { Context, Effect, Layer, Option } from "effect"
import { type DatabaseError, TaskNotFound, UserNotFound } from "../errors.ts"
import { TaskRepository } from "../repositories/TaskRepository.ts"
import { UserRepository } from "../repositories/UserRepository.ts"
import type { CreateTask, Task, UpdateTask } from "../schemas.ts"

/**
 * Business logic for a user's tasks.
 *
 * Every operation first checks that the user exists, so a request for
 * `/users/999/tasks` fails with `UserNotFound` rather than returning `[]`.
 */
export class TaskService extends Context.Service<TaskService, {
  readonly list: (userId: number) => Effect.Effect<ReadonlyArray<Task>, UserNotFound | DatabaseError>
  readonly get: (userId: number, taskId: number) => Effect.Effect<Task, UserNotFound | TaskNotFound | DatabaseError>
  readonly create: (userId: number, input: CreateTask) => Effect.Effect<Task, UserNotFound | DatabaseError>
  readonly update: (
    userId: number,
    taskId: number,
    input: UpdateTask
  ) => Effect.Effect<Task, UserNotFound | TaskNotFound | DatabaseError>
  readonly remove: (userId: number, taskId: number) => Effect.Effect<void, UserNotFound | TaskNotFound | DatabaseError>
}>()("app/TaskService") {
  static readonly layer = Layer.effect(
    TaskService,
    Effect.gen(function*() {
      const users = yield* UserRepository
      const tasks = yield* TaskRepository

      const ensureUser = (userId: number) =>
        users.findById(userId).pipe(
          Effect.flatMap(Option.match({
            onNone: () => Effect.fail(new UserNotFound({ userId })),
            onSome: () => Effect.void
          }))
        )

      const orNotFound = (userId: number, taskId: number) => <A, E>(self: Effect.Effect<Option.Option<A>, E>) =>
        Effect.flatMap(self, Option.match({
          onNone: () => Effect.fail(new TaskNotFound({ userId, taskId })),
          onSome: Effect.succeed
        }))

      return TaskService.of({
        list: (userId) => ensureUser(userId).pipe(Effect.andThen(tasks.findAllByUser(userId))),
        get: (userId, taskId) =>
          ensureUser(userId).pipe(Effect.andThen(tasks.findById(userId, taskId)), orNotFound(userId, taskId)),
        create: (userId, input) => ensureUser(userId).pipe(Effect.andThen(tasks.create(userId, input))),
        update: (userId, taskId, input) =>
          ensureUser(userId).pipe(Effect.andThen(tasks.update(userId, taskId, input)), orNotFound(userId, taskId)),
        remove: (userId, taskId) =>
          ensureUser(userId).pipe(
            Effect.andThen(tasks.delete(userId, taskId)),
            Effect.flatMap((deleted) => deleted ? Effect.void : Effect.fail(new TaskNotFound({ userId, taskId })))
          )
      })
    })
  )
}
