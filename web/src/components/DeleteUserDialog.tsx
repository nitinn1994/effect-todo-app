import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { useDeleteUser } from "@/hooks/queries"
import type { User } from "@/lib/api"

interface Props {
  user: User | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

/** Confirmation before deleting a user, since it also deletes their tasks. */
export function DeleteUserDialog({ user, open, onOpenChange, onDeleted }: Props) {
  const remove = useDeleteUser()

  const onConfirm = () => {
    if (!user) return
    remove.mutate(user.id, {
      onSuccess: () => {
        onOpenChange(false)
        onDeleted()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {user?.name}?</DialogTitle>
          <DialogDescription>This also deletes all of their tasks. It can't be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={remove.isPending}>
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
