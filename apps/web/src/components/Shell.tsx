import { Menu, Plus, Settings2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { SettingsSheet } from "../features/settings/SettingsSheet.tsx";
import { cn } from "../lib/cn.ts";
import { useHealth } from "../lib/queries.ts";
import { useWideShell } from "../lib/useMediaQuery.ts";
import { HuntList } from "./HuntList.tsx";
import { Wordmark } from "./Mark.tsx";
import { IconButton } from "./ui/Button.tsx";
import { useFocusTrap } from "./ui/Sheet.tsx";

interface ShellApi {
  /** The hunt list is docked beside the page (wide screens). Otherwise it opens as a drawer. */
  wide: boolean;
  openNav: () => void;
  openSettings: () => void;
}

const ShellContext = createContext<ShellApi>({ wide: true, openNav: () => {}, openSettings: () => {} });
export const useShell = () => use(ShellContext);

export function Shell({ children }: { children: ReactNode }) {
  const wide = useWideShell();
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the drawer when a link in it is followed, or when the window grows past it.
  useEffect(() => setNavOpen(false), [pathname, wide]);

  const api: ShellApi = { wide, openNav: () => setNavOpen(true), openSettings: () => setSettingsOpen(true) };

  return (
    <ShellContext value={api}>
      <a
        href="#main"
        className="sr-only z-[70] rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden">
        {wide && (
          <aside className="flex w-[256px] shrink-0 flex-col border-r border-line">
            <Sidebar layoutId="hunt-active" onSettings={api.openSettings} />
          </aside>
        )}
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
      {!wide && <Drawer open={navOpen} onClose={() => setNavOpen(false)} onSettings={api.openSettings} />}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </ShellContext>
  );
}

function Sidebar({ layoutId, onSettings, onClose }: { layoutId: string; onSettings: () => void; onClose?: () => void }) {
  const health = useHealth();
  const mock = health.data && (health.data.agent === "mock" || health.data.ebay === "mock");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between pl-5 pr-3">
        <Link to="/" className="rounded-md" aria-label="Scour, new hunt">
          <Wordmark />
        </Link>
        {onClose && <IconButton icon={X} label="Close menu" size="sm" onClick={onClose} />}
      </div>
      <div className="px-3 pt-2">
        <Link
          to="/"
          className="flex h-10 w-full items-center gap-2.5 rounded-full bg-raised px-4 text-sm font-medium text-ink transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.98]"
        >
          <Plus size={16} strokeWidth={2.25} aria-hidden />
          New hunt
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <HuntList layoutId={layoutId} />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-2.5">
        <button
          type="button"
          onClick={onSettings}
          className="flex h-9 items-center gap-2.5 rounded-full px-3 text-sm text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          <Settings2 size={16} aria-hidden />
          Settings
        </button>
        {mock && (
          <span
            className="mr-1 rounded-full bg-raised px-2.5 py-1 text-xs text-ink-3"
            title={`Agent: ${health.data!.agent} · eBay: ${health.data!.ebay}`}
          >
            Mock data
          </span>
        )}
      </div>
    </div>
  );
}

function Drawer({ open, onClose, onSettings }: { open: boolean; onClose: () => void; onSettings: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
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
            aria-label="Hunts"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 w-[300px] max-w-[86vw] bg-bg pt-safe shadow-[24px_0_64px_rgb(0_0_0/0.5)] focus:outline-none"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 42 }}
          >
            <Sidebar
              layoutId="hunt-active-drawer"
              onClose={onClose}
              onSettings={() => {
                onClose();
                onSettings();
              }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** The 56px bar over a page. Below the wide breakpoint it carries the menu button for the hunt list. */
export function TopBar({ children, className }: { children?: ReactNode; className?: string }) {
  const { wide, openNav } = useShell();
  return (
    <header className={cn("flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-line pl-2 pr-3 pt-safe sm:pr-4", wide && "pl-5", className)}>
      {!wide && <IconButton icon={Menu} label="Hunts" onClick={openNav} />}
      {children}
    </header>
  );
}
