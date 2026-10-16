import { useState, type FormEvent, type KeyboardEvent } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useDeleteTask, useUpdateTask } from "@/hooks/queries"
import type { Task } from "@/lib/api"
import { cn } from "@/lib/utils"

/** One task row: tick to complete, edit inline, delete on hover. */
export function TaskItem({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const update = useUpdateTask(task.userId)
  const remove = useDeleteTask(task.userId)

  const startEditing = () => {
    setTitle(task.title)
    setDescription(task.description ?? "")
    setEditing(true)
  }

  const save = (event?: FormEvent) => {
    event?.preventDefault()
    const input = { title: title.trim(), description: description.trim() || null }
    if (input.title === task.title && input.description === task.description) return setEditing(false)
    update.mutate({ taskId: task.id, input }, { onSuccess: () => setEditing(false) })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") setEditing(false)
  }

  if (editing) {
    return (
      <li className="py-2">
        <form onSubmit={save} className="grid gap-2" onKeyDown={onKeyDown}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" autoFocus />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            aria-label="Description"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={update.isPending}>Save</Button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="group flex items-start gap-3 py-2.5">
      <Checkbox
        className="mt-0.5"
        checked={task.completed}
        onCheckedChange={(checked) => update.mutate({ taskId: task.id, input: { completed: checked === true } })}
        aria-label={task.completed ? "Mark as not done" : "Mark as done"}
      />
      <button className="min-w-0 flex-1 text-left" onClick={startEditing}>
        <p className={cn("text-sm leading-5", task.completed && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        {task.description && <p className="truncate text-xs text-muted-foreground">{task.description}</p>}
      </button>
      <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        <Button variant="ghost" size="icon-xs" onClick={startEditing} aria-label="Edit task">
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => remove.mutate(task.id)}
          disabled={remove.isPending}
          aria-label="Delete task"
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}
