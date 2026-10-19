import { Settings as SettingsSchema } from "@scour/core";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { Sheet } from "../../components/ui/Sheet.tsx";
import { toast } from "../../components/ui/Toast.tsx";
import { cn } from "../../lib/cn.ts";
import { useHealth, useSaveSettings, useSettings } from "../../lib/queries.ts";

const NOTES_MAX = 2000;

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const save = useSaveSettings();
  const health = useHealth();
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const zipId = useId();
  const notesId = useId();
  const formId = useId();

  // Start from the saved values each time the sheet opens.
  useEffect(() => {
    if (!open || !settings.data) return;
    setZip(settings.data.postalCode ?? "");
    setNotes(settings.data.notes);
    setError(null);
  }, [open, settings.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = SettingsSchema.safeParse({ postalCode: zip.trim() || null, notes });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the ZIP code");
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast("Settings saved");
        onClose();
      },
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Settings"
      description="The agent reads these on every hunt."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={save.isPending} disabled={!settings.data}>
            Save
          </Button>
        </>
      }
    >
      {settings.isError ? (
        <p className="py-4 text-sm text-ink-3">
          Couldn't load settings.{" "}
          <button type="button" className="font-medium text-ink hover:underline" onClick={() => void settings.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <form id={formId} onSubmit={submit} className="flex flex-col gap-6 pb-1">
          <div>
            <label htmlFor={zipId} className="block text-sm font-medium text-ink">
              Ship to ZIP code
            </label>
            <p className="mt-1 text-[13px] leading-snug text-ink-3">For shipping estimates and totals.</p>
            <input
              id={zipId}
              data-autofocus
              value={zip}
              onChange={(e) => {
                setZip(e.target.value.replace(/\D/g, "").slice(0, 5));
                setError(null);
              }}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="78704"
              aria-invalid={!!error}
              aria-describedby={error ? `${zipId}-error` : undefined}
              disabled={!settings.data}
              className={cn(
                "mt-2.5 h-10 w-36 rounded-xl border bg-bg px-3.5 text-[15px] text-ink tnum placeholder:text-ink-3 focus:outline-none focus-visible:outline-none",
                error ? "border-danger/70" : "border-line-strong focus:border-ink-3",
              )}
            />
            {error && (
              <p id={`${zipId}-error`} className="mt-2 text-[13px] text-danger">
                {error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={notesId} className="block text-sm font-medium text-ink">
              Always keep in mind
            </label>
            <p className="mt-1 text-[13px] leading-snug text-ink-3">Preferences the agent applies to every hunt.</p>
            <textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
              rows={5}
              placeholder="I'd rather not buy from outside the US. Skip sellers under 98% feedback."
              disabled={!settings.data}
              className="mt-2.5 block w-full resize-y rounded-xl border border-line-strong bg-bg px-3.5 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none focus-visible:outline-none"
            />
            <p className="mt-1.5 text-right text-xs text-ink-3 tnum">
              {notes.length.toLocaleString()} / {NOTES_MAX.toLocaleString()}
            </p>
          </div>
          {health.data && (
            <p className="text-xs text-ink-3">
              Scour {health.data.version} · agent {health.data.agent === "claude" ? "on Claude" : "mocked"} · eBay{" "}
              {health.data.ebay === "live" ? "live" : "mocked"}
            </p>
          )}
        </form>
      )}
    </Sheet>
  );
}
