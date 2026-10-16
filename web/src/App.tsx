import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DeleteUserDialog } from "@/components/DeleteUserDialog"
import { TaskPanel } from "@/components/TaskPanel"
import { UserFormDialog } from "@/components/UserFormDialog"
import { UserList } from "@/components/UserList"
import { useUsers } from "@/hooks/queries"

/** Reads `?user=3` so the selected user survives a page refresh. */
const userIdFromUrl = () => {
  const id = Number(new URLSearchParams(window.location.search).get("user"))
  return Number.isInteger(id) && id > 0 ? id : undefined
}

export default function App() {
  const users = useUsers()
  const [selectedId, setSelectedId] = useState(userIdFromUrl)
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null)

  // Fall back to the first user when nothing (or a deleted user) is selected.
  const selected = users.data?.find((u) => u.id === selectedId) ?? users.data?.[0]

  useEffect(() => {
    const url = new URL(window.location.href)
    if (selected) url.searchParams.set("user", String(selected.id))
    else url.searchParams.delete("user")
    window.history.replaceState(null, "", url)
  }, [selected])

  return (
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-10 flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-foreground" />
        <span className="text-sm font-medium">Todo</span>
      </header>

      {users.isError && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Can't reach the API</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Make sure it's running (<code className="font-mono text-xs">npm run dev</code> in the project root).
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => users.refetch()}>Try again</Button>
        </div>
      )}

      {!users.isError && (
        <div className="grid gap-10 sm:grid-cols-[11rem_1fr]">
          <aside>
            <UserList
              users={users.data}
              isLoading={users.isLoading}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              onNew={() => setDialog("new")}
            />
          </aside>

          <main className="min-w-0">
            {selected && (
              <TaskPanel
                key={selected.id}
                user={selected}
                onEditUser={() => setDialog("edit")}
                onDeleteUser={() => setDialog("delete")}
              />
            )}

            {users.isSuccess && users.data.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-muted-foreground">Create a user to start adding tasks.</p>
                <Button size="sm" onClick={() => setDialog("new")}>
                  <Plus /> New user
                </Button>
              </div>
            )}
          </main>
        </div>
      )}

      <UserFormDialog
        open={dialog === "new" || dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
        user={dialog === "edit" ? selected : undefined}
        onSaved={(user) => setSelectedId(user.id)}
      />
      <DeleteUserDialog
        user={selected}
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        onDeleted={() => setSelectedId(undefined)}
      />
    </div>
  )
}
