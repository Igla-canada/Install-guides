"use client";
// Dropdown of existing users for the grant form. It does two jobs:
//   1. Prefills the link fields (label + phone + email) so an admin can share
//      an access LINK with someone on file instead of retyping a number.
//   2. Carries the selected account id (hidden `userId`) for "Grant access",
//      which gives a persistent installer account login access to the guides.
import { useState } from "react";

type PickUser = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  role: string;
};

export default function UserPicker({ users }: { users: PickUser[] }) {
  const [sel, setSel] = useState("");
  if (users.length === 0) return null;
  const selected = users.find((u) => u.id === sel);
  return (
    <div>
      <input type="hidden" name="userId" value={sel} />
      <select
        value={sel}
        onChange={(e) => {
          const id = e.target.value;
          setSel(id);
          const u = users.find((x) => x.id === id);
          const form = e.target.closest("form");
          if (u && form) {
            const label = form.querySelector<HTMLInputElement>('[name="granteeLabel"]');
            const phone = form.querySelector<HTMLInputElement>('[name="granteePhone"]');
            const email = form.querySelector<HTMLInputElement>('[name="granteeEmail"]');
            if (label) label.value = u.name;
            if (phone && u.phone) phone.value = u.phone;
            if (email && u.email) email.value = u.email;
          }
        }}
        className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-600"
        title="Pick an account — prefills a link, or is the target for Grant access"
      >
        <option value="">⌕ Pick an existing user…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
            {u.phone ? ` · ${u.phone}` : " · (no phone on file)"} — {u.role.toLowerCase()}
          </option>
        ))}
      </select>
      {selected && (
        <p className="mt-1 text-xs text-zinc-500">
          {selected.role === "INSTALLER" ? (
            <>
              <strong>{selected.name}</strong> selected — use <strong>Grant access</strong> to
              give this account login access.
            </>
          ) : (
            <>
              {selected.role.toLowerCase()} account — “Grant access” needs an{" "}
              <strong>installer</strong> account; this only prefills a link.
            </>
          )}
        </p>
      )}
    </div>
  );
}
