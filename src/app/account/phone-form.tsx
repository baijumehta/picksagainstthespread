"use client";

import { useState, useTransition } from "react";
import { saveMyPhoneAction } from "../actions/account";
import { formatPhone } from "@/lib/phone";
import { Button, Field, inputClass, Notice } from "@/components/ui";

export function PhoneForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = value.trim() !== saved.trim();

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveMyPhoneAction(value);
      setMsg({ ok: res.ok, message: res.message });
      if (res.ok) {
        // Show it the way a reload would, not as raw E.164.
        const display = formatPhone(res.phone);
        setSaved(display);
        setValue(display);
      }
    });
  }

  return (
    <div className="space-y-3">
      <Field
        label="Mobile number"
        hint="Any format is fine — 555-123-4567, (555) 123-4567, whatever you type."
      >
        <input
          className={inputClass}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(e) => { setValue(e.target.value); setMsg(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }}
          placeholder="555-123-4567"
        />
      </Field>

      {msg ? <Notice tone={msg.ok ? "ok" : "error"}>{msg.message}</Notice> : null}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
        {saved ? (
          <button
            type="button"
            className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => { setValue(""); setMsg(null); }}
            disabled={pending}
          >
            Remove it
          </button>
        ) : null}
      </div>
    </div>
  );
}
