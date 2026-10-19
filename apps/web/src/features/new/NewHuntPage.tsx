import { ArrowUp, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import { LiveDot } from "../../components/Live.tsx";
import { Wordmark } from "../../components/Mark.tsx";
import { TopBar, useShell } from "../../components/Shell.tsx";
import { IconButton } from "../../components/ui/Button.tsx";
import { toastError } from "../../components/ui/Toast.tsx";
import { errorMessage } from "../../lib/api.ts";
import { live } from "../../lib/client.ts";
import { useNow } from "../../lib/clock.ts";
import { plural, relativeTime } from "../../lib/format.ts";
import { easeOut } from "../../lib/motion.ts";
import { useHunts, useSettings } from "../../lib/queries.ts";

export function NewHuntPage() {
  const { wide, openSettings } = useShell();
  const navigate = useNavigate();
  const settings = useSettings();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const canSend = text.trim().length > 0 && !sending;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const id = await live.create(text.trim());
      // Chris may have moved on while the server was starting it; the hunt is in the list either way.
      if (mounted.current) navigate(`/hunts/${id}`);
    } catch (err) {
      toastError(errorMessage(err));
      if (mounted.current) setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const zip = settings.data?.postalCode;

  return (
    <>
      {!wide && (
        <TopBar>
          <Link to="/" className="rounded-md px-1">
            <Wordmark />
          </Link>
        </TopBar>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={easeOut}
          className="mx-auto flex min-h-full w-full max-w-[680px] flex-col justify-center px-4 pb-[16vh] pt-10 sm:px-8"
        >
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
            What are you looking for?
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Name the thing, your budget, and anything it has to come with.
          </p>

          <form
            onSubmit={submit}
            className="mt-7 rounded-2xl border border-line bg-surface transition-colors duration-200 focus-within:border-white/25"
          >
            <label htmlFor="hunt-text" className="sr-only">
              What are you looking for?
            </label>
            <textarea
              id="hunt-text"
              ref={inputRef}
              autoFocus
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={4000}
              enterKeyHint="go"
              placeholder="A ThinkCentre M920q under $150 with the power brick"
              className="block max-h-[40vh] min-h-[112px] w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[17px] leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none focus-visible:outline-none"
            />
            <div className="flex items-center justify-between gap-3 pb-3 pl-3.5 pr-3">
              <button
                type="button"
                onClick={openSettings}
                className="flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2 text-[13px] text-ink-3 transition-colors hover:bg-raised hover:text-ink-2"
              >
                <MapPin size={14} aria-hidden className="shrink-0" />
                <span className="truncate">{zip ? `Shipping to ${zip}` : "Add a ZIP for shipping totals"}</span>
              </button>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-ink-3 sm:inline">Enter to start</span>
                <IconButton
                  type="submit"
                  icon={ArrowUp}
                  label="Start hunting"
                  variant={canSend || sending ? "primary" : "secondary"}
                  size="md"
                  loading={sending}
                  disabled={!canSend}
                  className="disabled:opacity-100"
                />
              </div>
            </div>
          </form>

          {!wide && <RecentHunts />}
        </motion.div>
      </div>
    </>
  );
}

/** On narrow screens the hunt list lives in a drawer, so the start page keeps the latest few in reach. */
function RecentHunts() {
  const hunts = useHunts();
  const now = useNow(30_000);
  const list = hunts.data?.slice(0, 4) ?? [];
  if (list.length === 0) return null;
  return (
    <section className="mt-12" aria-labelledby="recent-hunts">
      <h2 id="recent-hunts" className="px-1 text-[13px] font-medium text-ink-3">
        Recent hunts
      </h2>
      <ul className="mt-2 flex flex-col gap-px">
        {list.map((h) => (
          <li key={h.id}>
            <Link
              to={`/hunts/${h.id}`}
              className="flex min-h-12 items-center justify-between gap-4 rounded-xl px-3 py-2 transition-colors hover:bg-surface"
            >
              <span className="min-w-0 truncate text-[15px] text-ink">{h.title}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3 tnum">
                {h.running && <LiveDot />}
                {h.running ? "Hunting" : `${plural(h.findingCount, "finding")} · ${relativeTime(h.updatedAt, now)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
