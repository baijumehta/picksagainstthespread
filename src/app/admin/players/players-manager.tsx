"use client";

import { useState, useTransition } from "react";
import {
  createPlayerAction, setPlayerActiveAction, updatePlayerAction,
} from "../../actions/admin";
import { Badge, Button, Field, inputClass, Notice } from "@/components/ui";

export interface ManagedPlayer {
  id: string;
  initials: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  isAdmin: boolean;
  isActive: boolean;
}

const blank = { initials: "", fullName: "", email: "", phone: "", isAdmin: false };

/**
 * Importing a sheet gives us initials but no addresses, so those rows get a
 * placeholder. Until it is replaced that person cannot be sent a sign-in link.
 */
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith("@placeholder.invalid");
}

export function PlayersManager({ players }: { players: ManagedPlayer[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [draft, setDraft] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsEmail = players.filter((p) => p.isActive && isPlaceholderEmail(p.email));

  function create() {
    startTransition(async () => {
      const res = await createPlayerAction(draft);
      setMsg(res);
      if (res.ok) setDraft(blank);
    });
  }

  return (
    <div className="space-y-5">
      {msg ? <Notice tone={msg.ok ? "ok" : "error"}>{msg.message}</Notice> : null}

      {needsEmail.length ? (
        <Notice tone="info">
          <strong>{needsEmail.length}</strong>{" "}
          {needsEmail.length === 1 ? "player has" : "players have"} no email yet, so they
          cannot sign in: {needsEmail.map((p) => p.initials).join(", ")}. Edit each one to add
          their address.
        </Notice>
      ) : null}

      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="mb-3 text-sm font-medium">Add a player</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Initials" hint="Shown publicly">
            <input
              className={inputClass}
              value={draft.initials}
              maxLength={6}
              onChange={(e) => setDraft({ ...draft, initials: e.target.value.toUpperCase() })}
              placeholder="BJM"
            />
          </Field>
          <Field label="Name" hint="Admin only, never public">
            <input
              className={inputClass}
              value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Email" hint="Where sign-in links go">
            <input
              className={inputClass}
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="them@example.com"
            />
          </Field>
          <Field label="Mobile" hint="For phase-two reminders">
            <input
              className={inputClass}
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="Optional"
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isAdmin}
              onChange={(e) => setDraft({ ...draft, isAdmin: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Commissioner (can edit everything)
          </label>
          <Button variant="primary" disabled={pending} onClick={create} className="ml-auto">
            {pending ? "Saving…" : "Add player"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-2 font-medium">Initials</th>
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Email</th>
              <th scope="col" className="px-3 py-2 font-medium">Mobile</th>
              <th scope="col" className="px-3 py-2 font-medium">Role</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) =>
              editingId === p.id ? (
                <EditRow
                  key={p.id}
                  player={p}
                  onCancel={() => setEditingId(null)}
                  onSaved={(m) => { setMsg(m); if (m.ok) setEditingId(null); }}
                />
              ) : (
                <tr
                  key={p.id}
                  className={`border-b border-line last:border-0 ${p.isActive ? "" : "opacity-55"}`}
                >
                  <td className="px-3 py-2 font-semibold tracking-wide">{p.initials}</td>
                  <td className="px-3 py-2 text-muted">{p.fullName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">
                    {isPlaceholderEmail(p.email) ? (
                      <span className="text-push">no email yet</span>
                    ) : (
                      p.email
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{p.phone ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.isAdmin ? <Badge tone="accent">commissioner</Badge> : <Badge>player</Badge>}
                    {!p.isActive ? <span className="ml-1"><Badge>inactive</Badge></span> : null}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(p.id)}>
                      Edit
                    </Button>
                    <ToggleActive player={p} onDone={setMsg} />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Deactivating keeps somebody&apos;s past picks in the standings but stops them signing in
        and takes them off the current card.
      </p>
    </div>
  );
}

function ToggleActive({
  player, onDone,
}: {
  player: ManagedPlayer;
  onDone: (m: { ok: boolean; message: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () =>
          onDone(await setPlayerActiveAction(player.id, !player.isActive)),
        )
      }
    >
      {player.isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

function EditRow({
  player, onCancel, onSaved,
}: {
  player: ManagedPlayer;
  onCancel: () => void;
  onSaved: (m: { ok: boolean; message: string }) => void;
}) {
  const [v, setV] = useState({
    initials: player.initials,
    fullName: player.fullName ?? "",
    email: player.email,
    phone: player.phone ?? "",
    isAdmin: player.isAdmin,
  });
  const [pending, startTransition] = useTransition();

  return (
    <tr className="border-b border-line bg-surface-2 last:border-0">
      <td className="px-2 py-2">
        <input
          className={inputClass}
          value={v.initials}
          maxLength={6}
          onChange={(e) => setV({ ...v, initials: e.target.value.toUpperCase() })}
        />
      </td>
      <td className="px-2 py-2">
        <input className={inputClass} value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <input className={inputClass} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <input className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={v.isAdmin}
            onChange={(e) => setV({ ...v, isAdmin: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Commissioner
        </label>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => onSaved(await updatePlayerAction(player.id, v)))
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </td>
    </tr>
  );
}
