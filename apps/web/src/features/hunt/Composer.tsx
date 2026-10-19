import { ArrowUp, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { IconButton } from "../../components/ui/Button.tsx";
import { quick } from "../../lib/motion.ts";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** The agent is replying: typing is fine, sending waits, and Stop takes the button's place. */
  running: boolean;
  /** The message is on its way. */
  sending: boolean;
  stopping: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

/** Follow-up field that grows with its text. Enter sends, Shift+Enter starts a new line. */
export function Composer({ value, onChange, onSend, onStop, running, sending, stopping, inputRef }: ComposerProps) {
  const canSend = value.trim().length > 0 && !running && !sending;

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, inputRef]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (canSend) onSend();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-1.5 pl-4 transition-colors duration-200 focus-within:border-white/25"
    >
      <label htmlFor="follow-up" className="sr-only">
        Refine the hunt
      </label>
      <textarea
        id="follow-up"
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={4000}
        enterKeyHint="send"
        placeholder={running ? "Write a follow-up while it works" : "Refine the hunt"}
        className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-[7px] text-[15px] leading-[22px] text-ink placeholder:text-ink-3 focus:outline-none focus-visible:outline-none"
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {running ? (
          <motion.button
            key="stop"
            type="button"
            onClick={onStop}
            disabled={stopping}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={quick}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-raised pl-3 pr-3.5 text-sm font-medium text-ink transition-colors hover:bg-hover disabled:text-ink-3"
          >
            <Square size={11} fill="currentColor" strokeWidth={0} aria-hidden />
            {stopping ? "Stopping" : "Stop"}
          </motion.button>
        ) : (
          <motion.span key="send" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={quick}>
            <IconButton
              type="submit"
              icon={ArrowUp}
              label="Send"
              variant={canSend || sending ? "primary" : "secondary"}
              loading={sending}
              disabled={!canSend}
              className="disabled:opacity-100"
            />
          </motion.span>
        )}
      </AnimatePresence>
    </form>
  );
}
