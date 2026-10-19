// Reads and writes for hunts, their messages and findings, and settings.
import type { Activity, Finding, FindingPatch, HuntSummary, HuntView, Listing, Message, MessageStatus, Settings, Verdict } from "@scour/core";
import { isRunning } from "./agent/replies.ts";
import { db, now } from "./db.ts";
import { notFound } from "./http.ts";

type Row = Record<string, unknown>;

interface HuntRow {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

const str = (v: unknown) => (v == null ? null : String(v));

function toMessage(r: Row): Message {
  return {
    id: Number(r.id),
    huntId: Number(r.hunt_id),
    role: r.role as Message["role"],
    text: String(r.text),
    status: r.status as MessageStatus,
    error: str(r.error),
    activity: JSON.parse(String(r.activity)) as Activity[],
    createdAt: String(r.created_at),
  };
}

function toFinding(r: Row): Finding {
  return {
    id: Number(r.id),
    huntId: Number(r.hunt_id),
    listing: JSON.parse(String(r.listing)) as Listing,
    verdict: r.verdict as Verdict,
    headline: String(r.headline),
    why: String(r.why),
    concerns: JSON.parse(String(r.concerns)) as string[],
    starred: r.starred === 1,
    dismissed: r.dismissed === 1,
    withdrawnReason: str(r.withdrawn_reason),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function huntRow(id: number): HuntRow {
  const row = db.prepare("SELECT * FROM hunts WHERE id = ?").get(id) as HuntRow | undefined;
  if (!row) throw notFound("Hunt");
  return row;
}

function toSummary(row: HuntRow): HuntSummary {
  const { n } = db
    .prepare("SELECT count(*) AS n FROM findings WHERE hunt_id = ? AND withdrawn_reason IS NULL AND dismissed = 0")
    .get(row.id) as { n: number };
  return { id: row.id, title: row.title, running: isRunning(row.id), findingCount: n, createdAt: row.created_at, updatedAt: row.updated_at };
}

export const huntSummary = (id: number) => toSummary(huntRow(id));

export function listHunts(): HuntSummary[] {
  return (db.prepare("SELECT * FROM hunts ORDER BY updated_at DESC").all() as unknown as HuntRow[]).map(toSummary);
}

export function huntView(id: number): HuntView {
  return { ...huntSummary(id), messages: messagesOf(id), findings: findingsOf(id) };
}

export function createHunt(title: string): HuntRow {
  const at = now();
  const { lastInsertRowid } = db.prepare("INSERT INTO hunts (title, created_at, updated_at) VALUES (?, ?, ?)").run(title, at, at);
  return huntRow(Number(lastInsertRowid));
}

export function renameHunt(id: number, title: string) {
  db.prepare("UPDATE hunts SET title = ? WHERE id = ?").run(title, id);
}

export function touchHunt(id: number) {
  db.prepare("UPDATE hunts SET updated_at = ? WHERE id = ?").run(now(), id);
}

export function deleteHunt(id: number) {
  huntRow(id);
  db.prepare("DELETE FROM hunts WHERE id = ?").run(id);
}

export function insertMessage(huntId: number, role: Message["role"], text: string, status: MessageStatus): Message {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO messages (hunt_id, role, text, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(huntId, role, text, status, now());
  return toMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(lastInsertRowid) as Row);
}

export function finishMessage(id: number, fields: { text: string; status: MessageStatus; error: string | null; activity: Activity[] }): Message {
  db.prepare("UPDATE messages SET text = ?, status = ?, error = ?, activity = ? WHERE id = ?").run(
    fields.text,
    fields.status,
    fields.error,
    JSON.stringify(fields.activity),
    id,
  );
  return toMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Row);
}

/** Keeps a reply's activity as it happens, so a reply cut short by a restart still shows what it did. */
export function saveActivity(id: number, activity: Activity[]) {
  db.prepare("UPDATE messages SET activity = ? WHERE id = ?").run(JSON.stringify(activity), id);
}

export function messagesOf(huntId: number): Message[] {
  return (db.prepare("SELECT * FROM messages WHERE hunt_id = ? ORDER BY id").all(huntId) as Row[]).map(toMessage);
}

/** Replies that were being written when the server stopped can't finish; say so instead of spinning forever. */
export function failInterruptedReplies() {
  db.prepare("UPDATE messages SET status = 'failed', error = ? WHERE status = 'pending'").run("The server restarted while the agent was working.");
}

export function findingsOf(huntId: number): Finding[] {
  return (db.prepare("SELECT * FROM findings WHERE hunt_id = ? ORDER BY id").all(huntId) as Row[]).map(toFinding);
}

export interface FindingInput {
  verdict: Verdict;
  headline: string;
  why: string;
  concerns: string[];
}

/** Adds a finding, or updates the one for the same listing (bringing it back if it was withdrawn). */
export function upsertFinding(huntId: number, listing: Listing, input: FindingInput): Finding {
  const at = now();
  const row = db
    .prepare(
      `INSERT INTO findings (hunt_id, item_id, listing, verdict, headline, why, concerns, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (hunt_id, item_id) DO UPDATE SET
         listing = excluded.listing, verdict = excluded.verdict, headline = excluded.headline, why = excluded.why,
         concerns = excluded.concerns, withdrawn_reason = NULL, updated_at = excluded.updated_at
       RETURNING *`,
    )
    .get(huntId, listing.itemId, JSON.stringify(listing), input.verdict, input.headline, input.why, JSON.stringify(input.concerns), at, at) as Row;
  return toFinding(row);
}

export function withdrawFinding(huntId: number, itemId: string, reason: string): Finding | null {
  const row = db
    .prepare("UPDATE findings SET withdrawn_reason = ?, updated_at = ? WHERE hunt_id = ? AND item_id = ? RETURNING *")
    .get(reason, now(), huntId, itemId) as Row | undefined;
  return row ? toFinding(row) : null;
}

export function patchFinding(id: number, patch: FindingPatch): Finding {
  const current = db.prepare("SELECT * FROM findings WHERE id = ?").get(id) as Row | undefined;
  if (!current) throw notFound("Finding");
  const starred = patch.starred ?? current.starred === 1;
  const dismissed = patch.dismissed ?? current.dismissed === 1;
  const row = db
    .prepare("UPDATE findings SET starred = ?, dismissed = ?, updated_at = ? WHERE id = ? RETURNING *")
    .get(starred ? 1 : 0, dismissed ? 1 : 0, now(), id) as Row;
  return toFinding(row);
}

const DEFAULT_SETTINGS: Settings = { postalCode: null, notes: "" };

export function getSettings(): Settings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as { value: string } | undefined;
  return row ? { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<Settings>) } : DEFAULT_SETTINGS;
}

export function putSettings(settings: Settings): Settings {
  db.prepare("INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(JSON.stringify(settings));
  return getSettings();
}
