# Effect To-Do API

A small, production-minded REST API for users and their to-do tasks, built with
**TypeScript**, **[Effect](https://effect.website) 4**, and **SQLite**.

It's meant for learning. The codebase is small enough to read in one sitting,
and it covers the Effect ideas you'll use in real services: services and
layers, typed errors, schema validation, resource management, and testing.

| Concern            | Tool                                                     |
| ------------------ | -------------------------------------------------------- |
| Runtime            | Node.js 24+                                              |
| Effect system      | `effect` 4.x (`effect/http` for server + client)         |
| HTTP server        | `@effect/platform-node` (`NodeHttpServer`)               |
| Database           | SQLite through Node's built-in `node:sqlite` (no native build step) |
| Validation         | `effect` `Schema`                                        |
| Tests              | `vitest` + `@effect/vitest`                              |
| Container          | Docker + Docker Compose                                  |

---

## Quick start

```bash
npm install
cp .env.example .env      # optional, defaults work out of the box
npm run seed              # creates ./data/todo.db with demo data
npm run dev               # http://localhost:3000 (restarts on file changes)
```

In another terminal:

```bash
curl localhost:3000/users
npm run client            # runs the typed HTTP client example
```

### With Docker

```bash
docker compose up -d --build
docker compose exec api node dist/seed.js     # optional demo data
curl localhost:3000/health
docker compose down                           # data is kept in the "todo-data" volume
docker compose down -v                        # ...this also deletes the data
```

## Scripts

| Script               | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Start the API with `tsx watch`, reading `.env`         |
| `npm run build`      | Compile TypeScript to `dist/`                          |
| `npm start`          | Run the compiled API (`dist/main.js`)                  |
| `npm test`           | Run all tests once                                     |
| `npm run test:watch` | Run tests in watch mode                                |
| `npm run typecheck`  | Type-check `src` and `test`                            |
| `npm run seed`       | Insert demo users and tasks (skipped if users exist)   |
| `npm run client`     | Call the running API with Effect's `HttpClient`        |

## Configuration

Values are read from environment variables. `.env` is loaded automatically
in development.

| Variable        | Default            | Description                                   |
| --------------- | ------------------ | --------------------------------------------- |
| `PORT`          | `3000`             | HTTP port                                     |
| `DATABASE_PATH` | `./data/todo.db`   | SQLite file path (`:memory:` for a throwaway DB) |
| `API_URL`       | `http://localhost:3000` | Base URL used by `npm run client`        |

---

## Project structure

```
src/
├── main.ts                     Entry point: wires layers together and starts the server
├── layers.ts                   The dependency graph (Config → DB → Repos → Services)
├── config.ts                   AppConfig service, read from env vars
├── errors.ts                   Typed domain errors (UserNotFound, EmailAlreadyExists, …)
├── schemas.ts                  Schemas for request bodies, path params and responses
├── db/
│   ├── Database.ts             SQLite connection as a scoped resource + query helpers
│   └── migrations.ts           Ordered SQL migrations and a tiny runner
├── repositories/
│   ├── UserRepository.ts       SQL for users (parameterized queries, row decoding)
│   └── TaskRepository.ts       SQL for tasks (always scoped by user id)
├── services/
│   ├── UserService.ts          Business rules for users
│   └── TaskService.ts          Business rules for tasks
├── http/
│   ├── routes.ts               REST endpoints: decode request → call service → encode response
│   └── errorResponse.ts        Maps typed errors to HTTP status codes + safe JSON bodies
├── seed.ts                     Demo data script
└── client.ts                   Typed HTTP client example
test/
├── services.test.ts            Unit tests: services with mocked repositories
├── repositories.test.ts        Integration tests: repositories against in-memory SQLite
└── api.test.ts                 End-to-end tests: real routes + services + SQLite, no network
```

Each layer only talks to the one below it:

```
HTTP routes  ──►  Services  ──►  Repositories  ──►  Database  ──►  SQLite
 (status codes)   (business rules)  (SQL + row decoding)  (connection lifecycle)
```

---

## The Effect concepts, and where they appear

### Services with `Context.Service`

> Effect 4 renamed `Context.Tag` to **`Context.Service`**. The idea is the same:
> a typed key for a dependency.

```ts
export class UserService extends Context.Service<UserService, {
  readonly get: (id: number) => Effect.Effect<User, UserNotFound | DatabaseError>
  // ...
}>()("app/UserService") {}
```

Code that needs it just yields it, and the requirement shows up in the type:

```ts
const program = Effect.gen(function*() {
  const users = yield* UserService   // Effect<..., ..., UserService>
  return yield* users.get(1)
})
```

### Layers for dependency injection

Every service has a `static layer` that builds it from its own dependencies.
`src/layers.ts` connects them:

```ts
export const RepositoriesLayer = Layer.mergeAll(UserRepository.layer, TaskRepository.layer).pipe(
  Layer.provide(Database.layer)
)
export const ServicesLayer = Layer.mergeAll(UserService.layer, TaskService.layer).pipe(
  Layer.provide(RepositoriesLayer)
)
```

Tests reuse these layers and swap out only the parts they need, such as fake
repositories or an in-memory database.

### Typed errors

`src/errors.ts` defines errors with `Data.TaggedError`. Each function's
signature lists the errors it can fail with, and the compiler checks them.
`src/http/errorResponse.ts` maps each one to an HTTP status with a `switch`
over `_tag`. Because the `switch` is exhaustive, adding a new error without
mapping it is a compile error.

| Error                         | Status | Body `error`          |
| ----------------------------- | ------ | --------------------- |
| `SchemaError` (bad input)     | 400    | `ValidationError`     |
| `HttpServerError` (bad JSON)  | 400    | `BadRequest`          |
| `UserNotFound`/`TaskNotFound` | 404    | `NotFound`            |
| `EmailAlreadyExists`          | 409    | `Conflict`            |
| `DatabaseError` / other       | 500    | `InternalServerError` |

500 responses always say just `"Something went wrong"`. The full error goes
to the server log, so SQL and stack traces never reach the client.

### Validation with `Schema`

* **Requests:** `HttpServerRequest.schemaBodyJson(CreateUser)` and
  `HttpRouter.schemaPathParams(UserParams)` decode and validate input. For
  example, they trim strings, check email format, and convert `"42"` to `42`.
* **Responses:** `HttpServerResponse.schemaJson(User)` encodes output through
  the schema before sending it.
* **Database rows:** repositories decode each row with a row schema, so a
  schema mismatch fails loudly instead of leaking `undefined`s.

### Resource management

`Database.layer` opens SQLite with `Effect.acquireRelease`:

```ts
const db = yield* Effect.acquireRelease(
  Effect.try(() => new DatabaseSync(databasePath)),   // acquire
  (db) => Effect.sync(() => db.close())               // release, always runs
)
```

The release step runs when the layer's scope closes:

* **Server:** on Ctrl+C or `docker stop`. `NodeRuntime.runMain` catches
  SIGINT/SIGTERM and interrupts the program, so the HTTP server stops first
  and then the DB closes. The log shows `Database connection closed`.
* **Seed script:** when the script finishes.
* **Tests:** at the end of every test, with a fresh in-memory DB per test.

### Migrations and parameterized queries

`src/db/migrations.ts` holds an ordered list of SQL migrations. They run at
startup, each one in a transaction, and are recorded in a `migrations` table
so none runs twice. To change the schema, append a new migration; never edit
one that has already shipped.

Every query uses `?` placeholders (`db.get("SELECT * FROM users WHERE id = ?", [id])`).
A test checks that a name like `Robert'); DROP TABLE users;--` is stored as
plain text.

---

## API reference

All bodies are JSON. Ids are positive integers.

### Health

```bash
curl localhost:3000/health
# {"status":"ok"}
```

### Users

| Method | Path              | Body                       | Success |
| ------ | ----------------- | -------------------------- | ------- |
| GET    | `/users`          |                            | 200     |
| POST   | `/users`          | `{ name, email }`          | 201     |
| GET    | `/users/:userId`  |                            | 200     |
| PATCH  | `/users/:userId`  | `{ name?, email? }`        | 200     |
| DELETE | `/users/:userId`  |                            | 204     |

Deleting a user also deletes their tasks. Emails are stored in lower case and
must be unique.

```bash
curl -X POST localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
# 201 {"id":1,"name":"Ada Lovelace","email":"ada@example.com","createdAt":"…","updatedAt":"…"}

curl -X PATCH localhost:3000/users/1 \
  -H 'content-type: application/json' \
  -d '{"name":"Countess Lovelace"}'

curl -X DELETE localhost:3000/users/1      # 204
```

### Tasks

| Method | Path                            | Body                                       | Success |
| ------ | ------------------------------- | ------------------------------------------ | ------- |
| GET    | `/users/:userId/tasks`          |                                            | 200     |
| POST   | `/users/:userId/tasks`          | `{ title, description?, completed? }`      | 201     |
| GET    | `/users/:userId/tasks/:taskId`  |                                            | 200     |
| PATCH  | `/users/:userId/tasks/:taskId`  | `{ title?, description?, completed? }`     | 200     |
| DELETE | `/users/:userId/tasks/:taskId`  |                                            | 204     |

```bash
curl -X POST localhost:3000/users/1/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Write tests","description":"With @effect/vitest"}'
# 201 {"id":1,"userId":1,"title":"Write tests","description":"With @effect/vitest","completed":false,…}

curl -X PATCH localhost:3000/users/1/tasks/1 \
  -H 'content-type: application/json' \
  -d '{"completed":true}'

curl localhost:3000/users/1/tasks
```

### Error responses

```bash
curl -X POST localhost:3000/users -H 'content-type: application/json' -d '{"name":"","email":"nope"}'
# 400 {"error":"ValidationError","message":"The request is invalid",
#      "details":["name: must not be empty","email: must be a valid email address"]}

curl localhost:3000/users/99
# 404 {"error":"NotFound","message":"User 99 was not found"}
```

### HTTP client example

`src/client.ts` calls the API with Effect's `HttpClient`. It prefixes a base
URL, fails on non-2xx responses, and validates each response body with the
same `User`/`Task` schemas the server uses.

```ts
const user = yield* client.execute(
  HttpClientRequest.post("/users").pipe(HttpClientRequest.bodyJsonUnsafe({ name, email }))
).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(User)))
```

---

## Testing

```bash
npm test
```

* **Unit tests** (`test/services.test.ts`) provide fake repositories with
  `Layer.succeed(UserRepository, { ... })`. They check business rules, such
  as "unknown user → `UserNotFound`", with no database involved.
* **Repository tests** (`test/repositories.test.ts`) run real SQL against an
  in-memory SQLite DB. They cover CRUD, the unique email constraint,
  cascading deletes, keeping each user's tasks separate, and SQL injection
  safety.
* **API tests** (`test/api.test.ts`) use `HttpRouter.toWebHandler` to turn
  the real app into a `fetch`-style function. They test status codes and
  JSON bodies end to end without opening a port.
