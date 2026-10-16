import { Context, Effect, Layer, Option, Schema } from "effect"
import { Database, type SqlParam } from "../db/Database.ts"
import { DatabaseError } from "../errors.ts"
import type { CreateTask, Task, UpdateTask } from "../schemas.ts"

/** Shape of a row in the `tasks` table. SQLite stores booleans as 0 / 1. */
const TaskRow = Schema.Struct({
  id: Schema.Number,
  user_id: Schema.Number,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  completed: Schema.Literals([0, 1]),
  created_at: Schema.String,
  updated_at: Schema.String
})

const toTask = (row: typeof TaskRow.Type): Task => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  completed: row.completed === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const decodeRow = (row: unknown) =>
  Schema.decodeUnknownEffect(TaskRow)(row).pipe(
    Effect.map(toTask),
    Effect.mapError((cause) => new DatabaseError({ message: "Unexpected row shape in tasks table", cause }))
  )

/** Data access for tasks. Every query is scoped to a user id. */
export class TaskRepository extends Context.Service<TaskRepository, {
  readonly findAllByUser: (userId: number) => Effect.Effect<ReadonlyArray<Task>, DatabaseError>
  readonly findById: (userId: number, taskId: number) => Effect.Effect<Option.Option<Task>, DatabaseError>
  readonly create: (userId: number, input: CreateTask) => Effect.Effect<Task, DatabaseError>
  readonly update: (userId: number, taskId: number, input: UpdateTask) => Effect.Effect<Option.Option<Task>, DatabaseError>
  readonly delete: (userId: number, taskId: number) => Effect.Effect<boolean, DatabaseError>
}>()("app/TaskRepository") {
  static readonly layer = Layer.effect(
    TaskRepository,
    Effect.gen(function*() {
      const db = yield* Database

      const findById = (userId: number, taskId: number) =>
        db.get("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [taskId, userId]).pipe(
          Effect.flatMap((row) => row === undefined ? Effect.succeed(Option.none()) : Effect.map(decodeRow(row), Option.some))
        )

      return TaskRepository.of({
        findAllByUser: (userId) =>
          db.all("SELECT * FROM tasks WHERE user_id = ? ORDER BY id", [userId]).pipe(
            Effect.flatMap(Effect.forEach(decodeRow))
          ),

        findById,

        create: (userId, input) =>
          db.run(
            "INSERT INTO tasks (user_id, title, description, completed) VALUES (?, ?, ?, ?)",
            [userId, input.title, input.description ?? null, input.completed ? 1 : 0]
          ).pipe(
            Effect.flatMap(({ lastInsertRowid }) => findById(userId, lastInsertRowid)),
            Effect.flatMap(Option.match({
              onNone: () => Effect.fail(new DatabaseError({ message: "Inserted task could not be read back" })),
              onSome: Effect.succeed
            }))
          ),

        update: (userId, taskId, input) => {
          const sets: Array<string> = []
          const params: Array<SqlParam> = []
          if (input.title !== undefined) {
            sets.push("title = ?")
            params.push(input.title)
          }
          if (input.description !== undefined) {
            sets.push("description = ?")
            params.push(input.description)
          }
          if (input.completed !== undefined) {
            sets.push("completed = ?")
            params.push(input.completed ? 1 : 0)
          }
          sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
          return db.run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [...params, taskId, userId])
            .pipe(Effect.flatMap(({ changes }) => changes === 0 ? Effect.succeed(Option.none()) : findById(userId, taskId)))
        },

        delete: (userId, taskId) =>
          db.run("DELETE FROM tasks WHERE id = ? AND user_id = ?", [taskId, userId]).pipe(
            Effect.map(({ changes }) => changes > 0)
          )
      })
    })
  )
}
