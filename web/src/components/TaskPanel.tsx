import { useState, type FormEvent } from "react"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCreateTask, useTasks } from "@/hooks/queries"
import type { User } from "@/lib/api"
import { cn } from "@/lib/utils"
import { TaskItem } from "./TaskItem"

const filters = ["all", "active", "done"] as const
type Filter = (typeof filters)[number]

interface Props {
  user: User
  onEditUser: () => void
  onDeleteUser: () => void
}

/** The selected user's tasks: quick-add, filters and the list. */
export function TaskPanel({ user, onEditUser, onDeleteUser }: Props) {
  const [title, setTitle] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const tasks = useTasks(user.id)
  const create = useCreateTask(user.id)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim().length === 0) return
    create.mutate({ title }, { onSuccess: () => setTitle("") })
  }

  const all = tasks.data ?? []
  const remaining = all.filter((task) => !task.completed).length
  const visible = all.filter((task) =>
    filter === "all" ? true : filter === "active" ? !task.completed : task.completed
  )

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{user.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="User actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEditUser}>Edit user</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDeleteUser}>Delete user</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <form onSubmit={onSubmit}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task and press Enter"
          disabled={create.isPending}
          aria-label="New task"
        />
      </form>

      <div>
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex gap-1">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs capitalize text-muted-foreground transition-colors hover:text-foreground",
                  filter === f && "bg-muted text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {remaining} of {all.length} left
          </span>
        </div>

        {tasks.isLoading && (
          <div className="grid gap-3 py-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        )}

        {tasks.isError && <p className="py-6 text-sm text-destructive">{tasks.error.message}</p>}

        {tasks.isSuccess && visible.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {all.length === 0 ? "No tasks yet." : filter === "done" ? "Nothing completed yet." : "All done."}
          </p>
        )}

        <ul className="divide-y">
          {visible.map((task) => <TaskItem key={task.id} task={task} />)}
        </ul>
      </div>
    </section>
  )
}
