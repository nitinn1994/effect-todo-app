import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCreateUser, useUpdateUser } from "@/hooks/queries"
import type { User } from "@/lib/api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass a user to edit it; leave empty to create a new one. */
  user?: User
  onSaved?: (user: User) => void
}

/** One dialog for both "New user" and "Edit user". */
export function UserFormDialog({ open, onOpenChange, user, onSaved }: Props) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const create = useCreateUser()
  const update = useUpdateUser()
  const mutation = user ? update : create

  // Reset the form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setName(user?.name ?? "")
      setEmail(user?.email ?? "")
      create.reset()
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const onSuccess = (saved: User) => {
      onSaved?.(saved)
      onOpenChange(false)
    }
    if (user) update.mutate({ id: user.id, input: { name, email } }, { onSuccess })
    else create.mutate({ name, email }, { onSuccess })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{user ? "Edit user" : "New user"}</DialogTitle>
            <DialogDescription>
              {user ? "Update the name or email address." : "Each user has their own task list."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="user-name">Name</Label>
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-email">Email</Label>
            <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : user ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
