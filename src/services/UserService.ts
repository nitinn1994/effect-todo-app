import { Context, Effect, Layer, Option } from "effect"
import { type DatabaseError, type EmailAlreadyExists, UserNotFound } from "../errors.ts"
import { UserRepository } from "../repositories/UserRepository.ts"
import type { CreateUser, UpdateUser, User } from "../schemas.ts"

/**
 * Business logic for users.
 *
 * The service turns "row not found" (`Option.none`) into a typed
 * `UserNotFound` error, so HTTP handlers never deal with `Option`s or SQL.
 */
export class UserService extends Context.Service<UserService, {
  readonly list: Effect.Effect<ReadonlyArray<User>, DatabaseError>
  readonly get: (id: number) => Effect.Effect<User, UserNotFound | DatabaseError>
  readonly create: (input: CreateUser) => Effect.Effect<User, EmailAlreadyExists | DatabaseError>
  readonly update: (id: number, input: UpdateUser) => Effect.Effect<User, UserNotFound | EmailAlreadyExists | DatabaseError>
  readonly remove: (id: number) => Effect.Effect<void, UserNotFound | DatabaseError>
}>()("app/UserService") {
  static readonly layer = Layer.effect(
    UserService,
    Effect.gen(function*() {
      const repo = yield* UserRepository

      const orNotFound = (userId: number) => <A, E>(self: Effect.Effect<Option.Option<A>, E>) =>
        Effect.flatMap(self, Option.match({
          onNone: () => Effect.fail(new UserNotFound({ userId })),
          onSome: Effect.succeed
        }))

      return UserService.of({
        list: repo.findAll,
        get: (id) => repo.findById(id).pipe(orNotFound(id)),
        create: (input) =>
          repo.create({ ...input, email: input.email.toLowerCase() }).pipe(
            Effect.tap((user) => Effect.logInfo(`Created user ${user.id}`))
          ),
        update: (id, input) =>
          repo.update(id, input.email === undefined ? input : { ...input, email: input.email.toLowerCase() })
            .pipe(orNotFound(id)),
        remove: (id) =>
          repo.delete(id).pipe(
            Effect.flatMap((deleted) => deleted ? Effect.void : Effect.fail(new UserNotFound({ userId: id })))
          )
      })
    })
  )
}
