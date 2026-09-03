"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createUserAction,
  deleteUserAction,
  updateUserAction,
} from "./actions";
import type { ManagedUser } from "@/lib/auth/user-list";

type Dialog =
  | { kind: "edit"; user: ManagedUser }
  | { kind: "delete"; user: ManagedUser }
  | { kind: "create" }
  | null;

type UserAction = (formData: FormData) => Promise<{ error: string | null; success: string | null }>;

export function UsersClient({ users, loadError }: { users: ManagedUser[]; loadError: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog(nextDialog: Dialog) {
    setError(null);
    setNotice(null);
    setDialog(nextDialog);
  }

  function closeDialog() {
    if (!pending) {
      setDialog(null);
      setError(null);
    }
  }

  function submit(action: UserAction, form: HTMLFormElement) {
    setError(null);
    const formData = new FormData(form);
    startTransition(() => {
      void action(formData).then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }

        setNotice(result.success);
        setDialog(null);
        router.refresh();
      });
    });
  }

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">User Management</h1>
          <p className="text-sm text-subtle mt-1">Manage access to the RBA Realtors lead viewer.</p>
        </div>
        <button
          type="button"
          onClick={() => openDialog({ kind: "create" })}
          className="rounded-md bg-accent text-white text-sm font-medium px-3 py-2 hover:bg-accent/90"
        >
          Create User
        </button>
      </div>

      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {loadError ? (
        <div className="border border-line rounded-lg bg-panel py-12 text-center">
          <p className="text-sm text-red-600">Could not load users. Please refresh.</p>
        </div>
      ) : (
        <UsersTable users={users} onEdit={(user) => openDialog({ kind: "edit", user })} onDelete={(user) => openDialog({ kind: "delete", user })} />
      )}

      {dialog?.kind === "create" && (
        <UserDialog title="Create User" error={error} pending={pending} onClose={closeDialog}>
          <form onSubmit={(event) => { event.preventDefault(); submit(createUserAction, event.currentTarget); }} className="space-y-4">
            <UserFields includePassword />
            <DialogButtons pending={pending} submitLabel="Create User" onCancel={closeDialog} />
          </form>
        </UserDialog>
      )}

      {dialog?.kind === "edit" && (
        <UserDialog title="Edit User" error={error} pending={pending} onClose={closeDialog}>
          <form onSubmit={(event) => { event.preventDefault(); submit(updateUserAction, event.currentTarget); }} className="space-y-4">
            <input type="hidden" name="userId" value={dialog.user.id} />
            <UserFields user={dialog.user} includePassword />
            <DialogButtons pending={pending} submitLabel="Save Changes" onCancel={closeDialog} />
          </form>
        </UserDialog>
      )}

      {dialog?.kind === "delete" && (
        <UserDialog title="Delete User" error={error} pending={pending} onClose={closeDialog} destructive>
          <form onSubmit={(event) => { event.preventDefault(); submit(deleteUserAction, event.currentTarget); }} className="space-y-4">
            <input type="hidden" name="userId" value={dialog.user.id} />
            <p className="text-sm text-ink">
              Permanently delete <strong>{dialog.user.name === "—" ? dialog.user.email : dialog.user.name}</strong> ({dialog.user.email})?
            </p>
            <p className="text-sm text-red-600">This account will be permanently deleted.</p>
            <DialogButtons pending={pending} submitLabel="Delete" onCancel={closeDialog} destructive />
          </form>
        </UserDialog>
      )}
    </main>
  );
}

function UserFields({ user, includePassword }: { user?: ManagedUser; includePassword: boolean }) {
  return (
    <>
      <Field label="Full Name" name="name" defaultValue={user?.name === "—" ? "" : user?.name} required />
      <Field label="Email" name="email" type="email" defaultValue={user?.email === "—" ? "" : user?.email} required />
      {includePassword && (
        <Field label="Password" name="password" type="password" required={!user} autoComplete="new-password" minLength={8} />
      )}
      <label className="block text-sm text-ink">
        <span className="block text-xs font-medium text-subtle mb-1">Role</span>
        <select name="role" defaultValue={user?.roleValue ?? "staff"} className="w-full rounded-md border border-line px-3 py-2 text-sm bg-panel outline-none focus:border-accent" required>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      {user && <p className="text-xs text-subtle">Leave Password empty to keep the current password.</p>}
    </>
  );
}

function Field({ label, name, type = "text", defaultValue, required, autoComplete, minLength }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; autoComplete?: string; minLength?: number }) {
  return (
    <label className="block text-sm text-ink">
      <span className="block text-xs font-medium text-subtle mb-1">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} autoComplete={autoComplete} minLength={minLength} className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
    </label>
  );
}

function DialogButtons({ pending, submitLabel, onCancel, destructive = false }: { pending: boolean; submitLabel: string; onCancel: () => void; destructive?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} disabled={pending} className="text-sm border border-line rounded-md px-3 py-2 text-ink disabled:opacity-50">Cancel</button>
      <button type="submit" disabled={pending} className={`${destructive ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent/90"} rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50`}>
        {pending ? "Working…" : submitLabel}
      </button>
    </div>
  );
}

function UserDialog({ title, error, pending, onClose, destructive = false, children }: { title: string; error: string | null; pending: boolean; onClose: () => void; destructive?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="user-dialog-title" className="w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 id="user-dialog-title" className={`text-base font-semibold ${destructive ? "text-red-700" : "text-ink"}`}>{title}</h2>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close dialog" className="text-lg leading-none text-subtle hover:text-ink disabled:opacity-50">×</button>
        </div>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {children}
      </div>
    </div>
  );
}

function UsersTable({ users, onEdit, onDelete }: { users: ManagedUser[]; onEdit: (user: ManagedUser) => void; onDelete: (user: ManagedUser) => void }) {
  return (
    <div className="border border-line rounded-lg bg-panel overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead><tr className="border-b border-line text-left text-xs text-subtle"><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Created</th><th className="px-3 py-2 font-medium">Last Sign In</th><th className="px-3 py-2 font-medium">Actions</th></tr></thead>
        <tbody>
          {users.length === 0 ? <tr><td colSpan={6} className="px-3 py-12 text-center text-sm text-subtle">No users found.</td></tr> : users.map((user) => (
            <tr key={user.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2 align-middle text-ink">{user.name}</td><td className="px-3 py-2 align-middle text-ink">{user.email}</td><td className="px-3 py-2 align-middle text-ink">{user.role}</td><td className="px-3 py-2 align-middle text-ink whitespace-nowrap">{user.created}</td><td className="px-3 py-2 align-middle text-ink whitespace-nowrap">{user.lastSignIn}</td>
              <td className="px-3 py-2 align-middle whitespace-nowrap"><div className="flex items-center gap-2"><button type="button" onClick={() => onEdit(user)} className="text-xs border border-line rounded px-2 py-1 text-ink hover:bg-canvas">Edit</button><button type="button" onClick={() => onDelete(user)} className="text-xs border border-line rounded px-2 py-1 text-red-700 hover:bg-red-50">Delete</button></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}