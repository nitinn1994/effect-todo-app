import type { DatabaseSync } from "node:sqlite"

/**
 * Schema migrations, applied in order.
 *
 * Never edit a migration that has already shipped — add a new one instead.
 * The `migrations` table records which ones have already run.
 */
export const migrations: ReadonlyArray<{ readonly id: number; readonly name: string; readonly sql: string }> = [
  {
    id: 1,
    name: "create_users",
    sql: `
      CREATE TABLE users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `
  },
  {
    id: 2,
    name: "create_tasks",
    sql: `
      CREATE TABLE tasks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title        TEXT    NOT NULL,
        description  TEXT,
        completed    INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX tasks_user_id_idx ON tasks(user_id);
    `
  }
]

/** Applies every pending migration inside a transaction. Returns the names that ran. */
export const runMigrations = (db: DatabaseSync): ReadonlyArray<string> => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)
  const applied = new Set(
    db.prepare("SELECT id FROM migrations").all().map((row) => Number(row.id))
  )
  const ran: Array<string> = []
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    db.exec("BEGIN")
    try {
      db.exec(migration.sql)
      db.prepare("INSERT INTO migrations (id, name) VALUES (?, ?)").run(migration.id, migration.name)
      db.exec("COMMIT")
      ran.push(migration.name)
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
  }
  return ran
}
