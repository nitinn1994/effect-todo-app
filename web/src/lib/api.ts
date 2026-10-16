/**
 * A tiny typed client for the Effect To-Do API.
 *
 * Requests go to `/api/*`, which the Vite dev server (or nginx in Docker)
 * forwards to the API, so the browser only ever talks to one origin.
 *
 * These types mirror the API's schemas (see `src/schemas.ts` in the API, or
 * the live OpenAPI document at `/api/openapi.json`).
 */

export interface User {
  id: number
  name: string
  email: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: number
  userId: number
  title: string
  description: string | null
  completed: boolean
  createdAt: string
  updatedAt: string
}

export type CreateUser = Pick<User, "name" | "email">
export type UpdateUser = Partial<CreateUser>
export type CreateTask = { title: string; description?: string | null; completed?: boolean }
export type UpdateTask = Partial<CreateTask>

/** Error body returned by the API for every 4xx / 5xx response. */
interface ErrorBody {
  error: string
  message: string
  details?: Array<string>
}

export class ApiError extends Error {
  readonly status: number
  readonly details: Array<string>

  constructor(status: number, body: ErrorBody | undefined) {
    super(body?.details?.[0] ?? body?.message ?? `Request failed with status ${status}`)
    this.status = status
    this.details = body?.details ?? []
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await response.text()
  const json = text.length > 0 ? JSON.parse(text) : undefined
  if (!response.ok) throw new ApiError(response.status, json)
  return json as T
}

export const api = {
  users: {
    list: () => request<Array<User>>("GET", "/users"),
    create: (input: CreateUser) => request<User>("POST", "/users", input),
    update: (id: number, input: UpdateUser) => request<User>("PATCH", `/users/${id}`, input),
    remove: (id: number) => request<void>("DELETE", `/users/${id}`)
  },
  tasks: {
    list: (userId: number) => request<Array<Task>>("GET", `/users/${userId}/tasks`),
    create: (userId: number, input: CreateTask) => request<Task>("POST", `/users/${userId}/tasks`, input),
    update: (userId: number, taskId: number, input: UpdateTask) =>
      request<Task>("PATCH", `/users/${userId}/tasks/${taskId}`, input),
    remove: (userId: number, taskId: number) => request<void>("DELETE", `/users/${userId}/tasks/${taskId}`)
  }
}
