import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { Context, Effect, Layer } from "effect"
import { AppConfig } from "../config.ts"
import { DatabaseError } from "../errors.ts"
import { runMigrations } from "./migrations.ts"

export type SqlParam = SQLInputValue

/**
 * A tiny wrapper around Node's built-in `node:sqlite` driver.
 *
 * Every method takes the SQL text and its parameters separately, so values
 * are always bound with `?` placeholders and never concatenated into SQL.
 */
export class Database extends Context.Service<Database, {
  /** Run a query and return every row. */
  readonly all: (sql: string, params?: ReadonlyArray<SqlParam>) => Effect.Effect<ReadonlyArray<unknown>, DatabaseError>
  /** Run a query and return the first row, if any. */
  readonly get: (sql: string, params?: ReadonlyArray<SqlParam>) => Effect.Effect<unknown, DatabaseError>
  /** Run an INSERT / UPDATE / DELETE statement. */
  readonly run: (
    sql: string,
    params?: ReadonlyArray<SqlParam>
  ) => Effect.Effect<{ readonly changes: number; readonly lastInsertRowid: number }, DatabaseError>
}>()("app/Database") {
  /**
   * Opens the database when the layer is built and closes it when the layer's
   * scope ends (server shutdown, end of a test, end of a script).
   */
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function*() {
      const { databasePath } = yield* AppConfig

      // acquireRelease guarantees `close()` runs, even on errors or interruption.
      const db = yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true })
            const db = new DatabaseSync(databasePath)
            db.exec("PRAGMA foreign_keys = ON")
            db.exec("PRAGMA journal_mode = WAL")
            return db
          },
          catch: (cause) => new DatabaseError({ message: `Could not open database at ${databasePath}`, cause })
        }),
        (db) =>
          Effect.sync(() => db.close()).pipe(
            Effect.andThen(Effect.logInfo("Database connection closed"))
          )
      )
      yield* Effect.logInfo(`Database opened at ${databasePath}`)

      const use = <A>(sql: string, f: () => A) =>
        Effect.try({
          try: f,
          catch: (cause) => new DatabaseError({ message: `Query failed: ${sql}`, cause })
        })

      yield* use("migrations", () => runMigrations(db))

      return Database.of({
        all: (sql, params = []) => use(sql, () => db.prepare(sql).all(...params)),
        get: (sql, params = []) => use(sql, () => db.prepare(sql).get(...params)),
        run: (sql, params = []) =>
          use(sql, () => {
            const result = db.prepare(sql).run(...params)
            return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) }
          })
      })
    })
  )
}

/** True when SQLite rejected a write because of a UNIQUE constraint. */
export const isUniqueViolation = (error: DatabaseError): boolean =>
  String((error.cause as { message?: unknown } | undefined)?.message ?? "").includes("UNIQUE constraint failed")
