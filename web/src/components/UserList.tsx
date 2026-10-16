import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { User } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Props {
  users: Array<User> | undefined
  isLoading: boolean
  selectedId: number | undefined
  onSelect: (id: number) => void
  onNew: () => void
}

/** Sidebar listing every user. */
export function UserList({ users, isLoading, selectedId, onSelect, onNew }: Props) {
  return (
    <nav className="flex flex-col gap-1">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Users</h2>
        <Button variant="ghost" size="icon-sm" onClick={onNew} aria-label="New user">
          <Plus />
        </Button>
      </div>

      {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}

      {users?.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">No users yet.</p>
      )}

      {users?.map((user) => (
        <button
          key={user.id}
          onClick={() => onSelect(user.id)}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
            user.id === selectedId && "bg-muted font-medium"
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{user.name}</span>
        </button>
      ))}
    </nav>
  )
}
