import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, type CreateTask, type CreateUser, type Task, type UpdateTask, type UpdateUser } from "@/lib/api"

/**
 * Data hooks built on TanStack Query. Queries cache server data; mutations
 * refresh the affected queries when they finish. Every failed mutation shows
 * a toast with the API's error message.
 */

const keys = {
  users: ["users"] as const,
  tasks: (userId: number) => ["users", userId, "tasks"] as const
}

const onError = (error: Error) => toast.error(error.message)

export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: api.users.list })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUser) => api.users.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.users })
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateUser }) => api.users.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.users })
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.users.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.users }),
    onError
  })
}

export function useTasks(userId: number) {
  return useQuery({ queryKey: keys.tasks(userId), queryFn: () => api.tasks.list(userId) })
}

export function useCreateTask(userId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTask) => api.tasks.create(userId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.tasks(userId) }),
    onError
  })
}

export function useUpdateTask(userId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: number; input: UpdateTask }) => api.tasks.update(userId, taskId, input),
    // Optimistic update: tick the checkbox instantly, roll back if the API fails.
    onMutate: async ({ taskId, input }) => {
      await queryClient.cancelQueries({ queryKey: keys.tasks(userId) })
      const previous = queryClient.getQueryData<Array<Task>>(keys.tasks(userId))
      queryClient.setQueryData<Array<Task>>(
        keys.tasks(userId),
        (tasks) => tasks?.map((task) => task.id === taskId ? { ...task, ...input } : task)
      )
      return { previous }
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(keys.tasks(userId), context?.previous)
      onError(error)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.tasks(userId) })
  })
}

export function useDeleteTask(userId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: number) => api.tasks.remove(userId, taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.tasks(userId) }),
    onError
  })
}
