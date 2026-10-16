import { Context, Effect, Layer, Option, Schema } from "effect"
import { Database, isUniqueViolation, type SqlParam } from "../db/Database.ts"
import { DatabaseError, EmailAlreadyExists } from "../errors.ts"
import type { CreateUser, UpdateUser, User } from "../schemas.ts"

/** Shape of a row in the `users` table. Decoding it catches schema drift early. */
const UserRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String
})

const toUser = (row: typeof UserRow.Type): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const decodeRow = (row: unknown) =>
  Schema.decodeUnknownEffect(UserRow)(row).pipe(
    Effect.map(toUser),
    Effect.mapError((cause) => new DatabaseError({ message: "Unexpected row shape in users table", cause }))
  )

/** Data access for users. Knows SQL, knows nothing about HTTP. */
export class UserRepository extends Context.Service<UserRepository, {
  readonly findAll: Effect.Effect<ReadonlyArray<User>, DatabaseError>
  readonly findById: (id: number) => Effect.Effect<Option.Option<User>, DatabaseError>
  readonly create: (input: CreateUser) => Effect.Effect<User, DatabaseError | EmailAlreadyExists>
  readonly update: (id: number, input: UpdateUser) => Effect.Effect<Option.Option<User>, DatabaseError | EmailAlreadyExists>
  readonly delete: (id: number) => Effect.Effect<boolean, DatabaseError>
}>()("app/UserRepository") {
  static readonly layer = Layer.effect(
    UserRepository,
    Effect.gen(function*() {
      const db = yield* Database

      const findById = (id: number) =>
        db.get("SELECT * FROM users WHERE id = ?", [id]).pipe(
          Effect.flatMap((row) => row === undefined ? Effect.succeed(Option.none()) : Effect.map(decodeRow(row), Option.some))
        )

      // Turn SQLite's UNIQUE violation into a typed domain error.
      const mapUniqueEmail = (email: string | undefined) => <A>(self: Effect.Effect<A, DatabaseError>) =>
        Effect.mapError(self, (error): DatabaseError | EmailAlreadyExists =>
          email !== undefined && isUniqueViolation(error) ? new EmailAlreadyExists({ email }) : error)

      return UserRepository.of({
        findAll: db.all("SELECT * FROM users ORDER BY id").pipe(
          Effect.flatMap(Effect.forEach(decodeRow))
        ),

        findById,

        create: (input) =>
          db.run("INSERT INTO users (name, email) VALUES (?, ?)", [input.name, input.email]).pipe(
            mapUniqueEmail(input.email),
            Effect.flatMap(({ lastInsertRowid }) => findById(lastInsertRowid)),
            Effect.flatMap(Option.match({
              onNone: () => Effect.fail(new DatabaseError({ message: "Inserted user could not be read back" })),
              onSome: Effect.succeed
            }))
          ),

        update: (id, input) => {
          // Build "SET name = ?, email = ?" only from the fields that were sent.
          const sets: Array<string> = []
          const params: Array<SqlParam> = []
          if (input.name !== undefined) {
            sets.push("name = ?")
            params.push(input.name)
          }
          if (input.email !== undefined) {
            sets.push("email = ?")
            params.push(input.email)
          }
          sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
          return db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...params, id]).pipe(
            mapUniqueEmail(input.email),
            Effect.flatMap(({ changes }) => changes === 0 ? Effect.succeed(Option.none()) : findById(id))
          )
        },

        delete: (id) =>
          db.run("DELETE FROM users WHERE id = ?", [id]).pipe(
            Effect.map(({ changes }) => changes > 0)
          )
      })
    })
  )
}
