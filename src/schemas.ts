import { Schema } from "effect"

/**
 * Schemas describe the shape of data at every boundary:
 * HTTP request bodies, path params, HTTP responses and database rows.
 */

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** A trimmed string that must contain between 1 and `max` characters. */
const Text = (max: number) =>
  Schema.Trim.pipe(
    Schema.check(
      Schema.isMinLength(1, { message: "must not be empty" }),
      Schema.isMaxLength(max, { message: `must be at most ${max} characters` })
    )
  )

const Email = Schema.Trim.pipe(
  Schema.check(
    Schema.isMaxLength(254),
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "must be a valid email address" })
  )
)

/** A positive integer id that arrives as a string in the URL, e.g. `/users/42`. */
const IdFromString = Schema.FiniteFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0, { message: "must be a positive integer" }))
)

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const User = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  email: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String
}).annotate({ identifier: "User" })
export type User = typeof User.Type

export const CreateUser = Schema.Struct({
  name: Text(100),
  email: Email
}).annotate({ identifier: "CreateUser" })
export type CreateUser = typeof CreateUser.Type

export const UpdateUser = Schema.Struct({
  name: Schema.optionalKey(Text(100)),
  email: Schema.optionalKey(Email)
}).annotate({ identifier: "UpdateUser" })
export type UpdateUser = typeof UpdateUser.Type

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const Task = Schema.Struct({
  id: Schema.Int,
  userId: Schema.Int,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  completed: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String
}).annotate({ identifier: "Task" })
export type Task = typeof Task.Type

export const CreateTask = Schema.Struct({
  title: Text(200),
  description: Schema.optionalKey(Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(2000))))),
  completed: Schema.optionalKey(Schema.Boolean)
}).annotate({ identifier: "CreateTask" })
export type CreateTask = typeof CreateTask.Type

export const UpdateTask = Schema.Struct({
  title: Schema.optionalKey(Text(200)),
  description: Schema.optionalKey(Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(2000))))),
  completed: Schema.optionalKey(Schema.Boolean)
}).annotate({ identifier: "UpdateTask" })
export type UpdateTask = typeof UpdateTask.Type

// ---------------------------------------------------------------------------
// Path parameters
// ---------------------------------------------------------------------------

export const UserParams = Schema.Struct({ userId: IdFromString })
export const TaskParams = Schema.Struct({ userId: IdFromString, taskId: IdFromString })

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

export const ErrorResponse = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
  details: Schema.optionalKey(Schema.Array(Schema.String))
})
export type ErrorResponse = typeof ErrorResponse.Type
