/**
 * End-to-end tests for the HTTP API.
 *
 * `HttpRouter.toWebHandler` turns the real routes + real services + a real
 * in-memory SQLite database into a `fetch`-style function, so we can send
 * requests without opening a network port.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { AppConfig } from "../src/config.ts"
import { ApiRoutes } from "../src/http/routes.ts"
import { ServicesLayer } from "../src/layers.ts"

let app: ReturnType<typeof makeApp>

const makeApp = () =>
  HttpRouter.toWebHandler(
    ApiRoutes.pipe(
      Layer.provide(ServicesLayer),
      Layer.provide(AppConfig.layerWith({ databasePath: ":memory:" })),
      Layer.provide(HttpServer.layerServices)
    ),
    { disableLogger: true }
  )

beforeEach(() => {
  app = makeApp()
})

// Disposing runs the layer finalizers, which closes the SQLite connection.
afterEach(async () => {
  await app.dispose()
})

const request = async (method: string, path: string, body?: unknown) => {
  const response = await app.handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
    })
  )
  const text = await response.text()
  return { status: response.status, body: text.length > 0 ? JSON.parse(text) : undefined }
}

const createUser = async (name = "Ada", email = "ada@example.com") => {
  const { body, status } = await request("POST", "/users", { name, email })
  expect(status).toBe(201)
  return body as { id: number }
}

describe("GET /health", () => {
  it("returns ok", async () => {
    expect(await request("GET", "/health")).toEqual({ status: 200, body: { status: "ok" } })
  })
})

describe("/users", () => {
  it("supports the full CRUD lifecycle", async () => {
    const user = await createUser("  Ada  ", "ADA@example.com")
    expect(user).toMatchObject({ id: 1, name: "Ada", email: "ada@example.com" })

    expect((await request("GET", "/users")).body).toHaveLength(1)
    expect((await request("GET", "/users/1")).body).toMatchObject({ name: "Ada" })

    const updated = await request("PATCH", "/users/1", { name: "Ada Lovelace" })
    expect(updated).toMatchObject({ status: 200, body: { name: "Ada Lovelace", email: "ada@example.com" } })

    expect(await request("DELETE", "/users/1")).toEqual({ status: 204, body: undefined })
    expect((await request("GET", "/users/1")).status).toBe(404)
  })

  it("returns 400 with details for invalid input", async () => {
    const { body, status } = await request("POST", "/users", { name: "", email: "not-an-email" })
    expect(status).toBe(400)
    expect(body.error).toBe("ValidationError")
    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringContaining("name"), expect.stringContaining("email")])
    )
  })

  it("returns 400 for malformed JSON", async () => {
    const { body, status } = await request("POST", "/users", "{not json")
    expect(status).toBe(400)
    expect(body.error).toBe("BadRequest")
  })

  it("returns 400 for a non-numeric id", async () => {
    expect((await request("GET", "/users/abc")).status).toBe(400)
  })

  it("returns 404 for an unknown user", async () => {
    expect(await request("GET", "/users/99")).toEqual({
      status: 404,
      body: { error: "NotFound", message: "User 99 was not found" }
    })
  })

  it("returns 409 for a duplicate email", async () => {
    await createUser()
    const { body, status } = await request("POST", "/users", { name: "Copy", email: "ada@example.com" })
    expect(status).toBe(409)
    expect(body.error).toBe("Conflict")
  })
})

describe("/users/:userId/tasks", () => {
  it("supports the full CRUD lifecycle", async () => {
    const user = await createUser()
    const base = `/users/${user.id}/tasks`

    const created = await request("POST", base, { title: "Write tests", description: "With Effect" })
    expect(created).toMatchObject({
      status: 201,
      body: { id: 1, userId: user.id, title: "Write tests", description: "With Effect", completed: false }
    })

    const updated = await request("PATCH", `${base}/1`, { completed: true, description: null })
    expect(updated.body).toMatchObject({ completed: true, description: null })

    expect((await request("GET", base)).body).toHaveLength(1)
    expect((await request("GET", `${base}/1`)).body).toMatchObject({ completed: true })

    expect((await request("DELETE", `${base}/1`)).status).toBe(204)
    expect((await request("GET", `${base}/1`)).status).toBe(404)
  })

  it("returns 404 when the user does not exist", async () => {
    const { body, status } = await request("POST", "/users/99/tasks", { title: "Orphan" })
    expect(status).toBe(404)
    expect(body.message).toBe("User 99 was not found")
  })

  it("does not let one user read another user's task", async () => {
    const ada = await createUser()
    const alan = await createUser("Alan", "alan@example.com")
    await request("POST", `/users/${ada.id}/tasks`, { title: "Private" })

    expect((await request("GET", `/users/${alan.id}/tasks/1`)).status).toBe(404)
  })

  it("rejects a task without a title", async () => {
    const user = await createUser()
    expect((await request("POST", `/users/${user.id}/tasks`, { completed: "yes" })).status).toBe(400)
  })
})
