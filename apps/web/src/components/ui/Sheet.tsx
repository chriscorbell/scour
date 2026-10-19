import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { IconButton } from "./Button.tsx";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Trap Tab inside a panel, close on Escape, and give focus back to where it was when it closes. */
export function useFocusTrap(open: boolean, panel: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      const el = panel.current;
      if (!el) return;
      const first = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restore?.focus?.({ preventScroll: true });
    };
  }, [open, panel]);
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Bottom sheet on phones, centred dialog from md up. */
export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(open, panelRef, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-[0_24px_64px_rgb(0_0_0/0.5)] focus:outline-none",
              "rounded-t-2xl md:max-h-[86dvh] md:max-w-lg md:rounded-2xl",
            )}
            initial={desktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.98, y: 4 } : { y: "100%" }}
            transition={desktop ? { duration: 0.22, ease: [0.16, 1, 0.3, 1] } : { type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5 md:px-6">
              <div className="min-w-0 pt-1">
                <h2 id={titleId} className="text-lg font-semibold leading-tight tracking-tight text-ink">
                  {title}
                </h2>
                {description && (
                  <div id={descId} className="mt-1 text-sm text-ink-3">
                    {description}
                  </div>
                )}
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-1.5" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 md:px-6">{children}</div>
            {footer && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
