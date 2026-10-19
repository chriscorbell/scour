import { Settings as SettingsSchema, type AgentModel, type Effort } from "@scour/core";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { Sheet } from "../../components/ui/Sheet.tsx";
import { toast } from "../../components/ui/Toast.tsx";
import { cn } from "../../lib/cn.ts";
import { spring } from "../../lib/motion.ts";
import { useHealth, useModels, useSaveSettings, useSettings } from "../../lib/queries.ts";

const NOTES_MAX = 2000;

const EFFORTS: { id: Effort; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "X-high" },
  { id: "max", label: "Max" },
];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const save = useSaveSettings();
  const health = useHealth();
  const models = useModels();
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<Effort>("high");
  const [error, setError] = useState<string | null>(null);
  const zipId = useId();
  const notesId = useId();
  const modelId = useId();
  const formId = useId();

  // Start from the saved values each time the sheet opens.
  useEffect(() => {
    if (!open || !settings.data) return;
    setZip(settings.data.postalCode ?? "");
    setNotes(settings.data.notes);
    setModel(settings.data.model);
    setEffort(settings.data.effort);
    setError(null);
  }, [open, settings.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = SettingsSchema.safeParse({ postalCode: zip.trim() || null, notes, model, effort });
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
          <div>
            <label htmlFor={modelId} className="block text-sm font-medium text-ink">
              Model
            </label>
            <ModelSelect id={modelId} value={model} onChange={setModel} models={models.data} disabled={!settings.data} />
            {models.isError && (
              <p className="mt-2 text-[13px] text-ink-3">
                Couldn't load the model list.{" "}
                <button type="button" className="font-medium text-ink hover:underline" onClick={() => void models.refetch()}>
                  Retry
                </button>
              </p>
            )}
          </div>
          <EffortPicker value={effort} onChange={setEffort} model={models.data?.find((m) => m.id === model)} disabled={!settings.data} />
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

function ModelSelect({ id, value, onChange, models, disabled }: { id: string; value: string; onChange: (id: string) => void; models: AgentModel[] | undefined; disabled: boolean }) {
  // The saved model stays listed while the list loads, or if the account stops offering it.
  const options = models ?? [];
  const listed = options.some((m) => m.id === value);
  const current = options.find((m) => m.id === value);
  return (
    <>
      <div className="relative mt-2.5">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={current ? `${id}-about` : undefined}
          className="h-10 w-full appearance-none rounded-xl border border-line-strong bg-bg pl-3.5 pr-10 text-[15px] text-ink focus:border-ink-3 focus:outline-none focus-visible:outline-none disabled:text-ink-3"
        >
          {!listed && value && (
            <option value={value} className="bg-surface text-ink">
              {value}
            </option>
          )}
          {options.map((m) => (
            <option key={m.id} value={m.id} className="bg-surface text-ink">
              {m.name}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
      </div>
      {current && (
        <p id={`${id}-about`} className="mt-2 text-[13px] leading-snug text-ink-3">
          {current.description}
        </p>
      )}
    </>
  );
}

function EffortPicker({ value, onChange, model, disabled }: { value: Effort; onChange: (e: Effort) => void; model: AgentModel | undefined; disabled: boolean }) {
  const name = useId();
  const unsupported = model && model.efforts.length === 0;
  return (
    <fieldset disabled={disabled || unsupported}>
      <legend className="block text-sm font-medium text-ink">Effort</legend>
      <p className="mt-1 text-[13px] leading-snug text-ink-3">
        {unsupported ? `${model.name} doesn't take an effort level.` : "Higher looks harder at each listing but takes longer."}
      </p>
      <div className={cn("mt-2.5 grid grid-cols-5 gap-1 rounded-xl border border-line-strong bg-bg p-1", unsupported && "opacity-50")}>
        {EFFORTS.map((e) => {
          const off = model != null && !model.efforts.includes(e.id);
          const on = value === e.id && !unsupported;
          return (
            <label
              key={e.id}
              className={cn(
                "relative isolate flex h-8 cursor-pointer items-center justify-center rounded-lg text-[13px] font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent",
                on ? "text-ink" : "text-ink-3 hover:text-ink-2",
                off && "cursor-not-allowed opacity-40 hover:text-ink-3",
              )}
            >
              <input type="radio" name={name} value={e.id} checked={value === e.id} disabled={off} onChange={() => onChange(e.id)} className="sr-only" />
              {on && <motion.span layoutId="effort-pill" transition={spring} className="absolute inset-0 -z-10 rounded-lg bg-raised" aria-hidden />}
              {e.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
