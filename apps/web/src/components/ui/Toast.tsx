import { CircleAlert, CircleCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn.ts";
import { spring } from "../../lib/motion.ts";

type Tone = "default" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Show a transient message. Errors and messages with an action stay a little longer. */
export function toast(message: string, opts: { tone?: Tone; action?: ToastItem["action"]; duration?: number } = {}) {
  const id = nextId++;
  const tone = opts.tone ?? "default";
  items = [...items.slice(-2), { id, message, tone, action: opts.action }];
  emit();
  window.setTimeout(() => dismiss(id), opts.duration ?? (tone === "error" || opts.action ? 5000 : 3200));
  return id;
}

export const toastError = (message: string) => toast(message, { tone: "error" });

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end lg:px-0"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.15 } }}
            transition={spring}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-raised py-2 pl-3.5 pr-2 text-sm text-ink shadow-[0_8px_32px_rgb(0_0_0/0.45)]",
              !t.action && "pr-4",
            )}
          >
            {t.tone === "error" ? (
              <CircleAlert size={16} className="shrink-0 text-danger" aria-hidden />
            ) : (
              <CircleCheck size={16} className="shrink-0 text-ink-2" aria-hidden />
            )}
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-full px-3 py-1 font-medium text-ink transition-colors hover:bg-hover"
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
