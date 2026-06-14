"use client";
// Dropdown of existing users that prefills the grant form's label + phone, so
// an admin can share an access link with someone on file instead of retyping a
// phone number. Sets the sibling inputs by name (works in any grant <form>).

type PickUser = { id: string; name: string; phone: string | null; role: string };

export default function UserPicker({ users }: { users: PickUser[] }) {
  if (users.length === 0) return null;
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const u = users.find((x) => x.id === e.target.value);
        const form = e.target.closest("form");
        if (!form) return;
        const label = form.querySelector<HTMLInputElement>('[name="granteeLabel"]');
        const phone = form.querySelector<HTMLInputElement>('[name="granteePhone"]');
        if (u) {
          if (label) label.value = u.name;
          if (phone && u.phone) phone.value = u.phone;
        }
        e.target.selectedIndex = 0; // reset so it stays a "picker", not a value
      }}
      className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-600"
      title="Prefill from an existing user"
    >
      <option value="">⌕ Pick an existing user…</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
          {u.phone ? ` · ${u.phone}` : " · (no phone on file)"} — {u.role.toLowerCase()}
        </option>
      ))}
    </select>
  );
}
