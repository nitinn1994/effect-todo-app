# Effect To-Do API

A small, production-minded REST API for users and their to-do tasks, built with
**TypeScript**, **[Effect](https://effect.website) 4**, and **SQLite**, plus a
minimal web UI in [`web/`](web).

It's meant for learning. The codebase is small enough to read in one sitting,
and it covers the Effect ideas you'll use in real services: services and
layers, typed errors, schema validation, resource management, and testing.

| Concern            | Tool                                                     |
| ------------------ | -------------------------------------------------------- |
| Runtime            | Node.js 24+                                              |
| Effect system      | `effect` 4.x (`effect/http` for server + client)         |
| HTTP server        | `@effect/platform-node` (`NodeHttpServer`)               |
| API definition     | `effect/http-api` (`HttpApi`), which generates the OpenAPI spec |
| API docs           | Swagger UI (`HttpApiSwagger`) at `/docs`                 |
| Database           | SQLite through Node's built-in `node:sqlite` (no native build step) |
| Validation         | `effect` `Schema`                                        |
| Tests              | `vitest` + `@effect/vitest`                              |
| Web UI             | React + Vite, Tailwind CSS, shadcn/ui, TanStack Query    |
| Container          | Docker + Docker Compose (API + nginx-served UI)          |

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

### Web UI

With the API running, start the UI in a second terminal:

```bash
npm run web:install       # first time only
npm run web:dev           # http://localhost:5173
```

The Vite dev server forwards `/api/*` to the API on port 3000, so the browser
only talks to one origin and the API needs no CORS setup. Set `API_URL` to
point the proxy somewhere else.

### API docs

Open **http://localhost:3000/docs** for interactive Swagger UI, where you can
try every endpoint from the browser. The raw OpenAPI 3.1 document is at
**http://localhost:3000/openapi.json**.

### With Docker

```bash
docker compose up -d --build
docker compose exec api node dist/seed.js     # optional demo data
open http://localhost:8080                    # web UI (nginx, proxies /api → api)
curl localhost:3000/health                    # API directly
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
| `npm run web:install`| Install the UI's dependencies (`web/`)                 |
| `npm run web:dev`    | Start the UI dev server on port 5173                   |
| `npm run web:build`  | Type-check and build the UI to `web/dist/`             |

## Configuration

Values are read from environment variables. `.env` is loaded automatically
in development.

| Variable        | Default            | Description                                   |
| --------------- | ------------------ | --------------------------------------------- |
| `PORT`          | `3000`             | HTTP port                                     |
| `DATABASE_PATH` | `./data/todo.db`   | SQLite file path (`:memory:` for a throwaway DB) |
| `API_URL`       | `http://localhost:3000` | Base URL used by `npm run client` and the UI dev proxy |
| `WEB_PORT`      | `8080`             | Host port for the UI in Docker Compose        |

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
│   ├── api.ts                  API *definition*: endpoints, schemas, status codes (drives OpenAPI/Swagger)
│   └── handlers.ts             API *implementation*: calls services, maps domain errors → HTTP errors
├── seed.ts                     Demo data script
└── client.ts                   Typed HTTP client example
test/
├── services.test.ts            Unit tests: services with mocked repositories
├── repositories.test.ts        Integration tests: repositories against in-memory SQLite
└── api.test.ts                 End-to-end tests: real API + services + SQLite, plus /docs and /openapi.json
web/                            Minimal React UI (Vite + Tailwind + shadcn/ui)
├── src/
│   ├── App.tsx                 Layout: user sidebar + selected user's tasks
│   ├── lib/api.ts              Typed fetch client for the API (`/api/*`)
│   ├── hooks/queries.ts        TanStack Query hooks (caching, optimistic task toggles)
│   └── components/             UserList, TaskPanel, TaskItem, dialogs, and shadcn/ui primitives in ui/
├── nginx.conf                  Serves the build and proxies /api to the API container
└── Dockerfile                  Builds the UI and serves it with nginx
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
`src/http/handlers.ts` maps each one to an HTTP error schema from
`src/http/api.ts` with a `switch` over `_tag`. Because the `switch` is
exhaustive, adding a new error without mapping it is a compile error. Each
endpoint also declares which HTTP errors it may return, and a handler that
fails with an undeclared error does not compile. Those declarations are also
what Swagger shows.

| Error                         | Status | Body `error`          |
| ----------------------------- | ------ | --------------------- |
| Invalid body / params         | 400    | `ValidationError`     |
| Body is not valid JSON        | 400    | `BadRequest`          |
| `UserNotFound`/`TaskNotFound` | 404    | `NotFound`            |
| `EmailAlreadyExists`          | 409    | `Conflict`            |
| `DatabaseError` / other       | 500    | `InternalServerError` |

500 responses always say just `"Something went wrong"`. The full error goes
to the server log, so SQL and stack traces never reach the client.

### HTTP API definition, OpenAPI and Swagger

The HTTP layer is split into a **definition** and an **implementation**:

```ts
// src/http/api.ts: what the API looks like
HttpApiEndpoint.post("create", "/users", {
  payload: CreateUser,                         // request body schema
  success: User.pipe(HttpApiSchema.status(201)),
  error: [Conflict, InternalServerError]       // documented error responses
})

// src/http/handlers.ts: what it does
handlers.handle("create", ({ payload }) => http(users.create(payload)))
```

The server, the OpenAPI document (`/openapi.json`) and Swagger UI (`/docs`)
all come from the same `TodoApi` definition, so the docs stay in sync with
the code. Swagger UI is served by the app itself and loads nothing from a
CDN, so it also works offline.

### Validation with `Schema`

* **Requests:** `HttpApi` decodes the body and path params with the schemas
  declared on each endpoint. For example, it trims strings, checks email
  format, and converts `"42"` to `42`. The handler only sees valid, typed
  data. The `RequestValidation` middleware turns failures into a 400
  `ValidationError` with details such as `email: must be a valid email address`.
  Decoding stops at the first invalid field.
* **Responses:** return values are encoded through the `success` schema
  before they are sent.
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
#      "details":["name: must not be empty"]}

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
  JSON bodies end to end without opening a port. They also check that
  `/openapi.json` lists every path with the right status codes and that
  `/docs` serves Swagger UI.
