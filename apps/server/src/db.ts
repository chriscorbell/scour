// SQLite through Node's built-in driver. The schema moves forward one step per entry in MIGRATIONS,
// tracked by PRAGMA user_version; never edit a step that has shipped, add one.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env.ts";

fs.mkdirSync(env.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(env.dataDir, "scour.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

const MIGRATIONS = [
  `
  CREATE TABLE hunts (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    error TEXT,
    activity TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX messages_by_hunt ON messages(hunt_id, id);
  CREATE TABLE findings (
    id INTEGER PRIMARY KEY,
    hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    listing TEXT NOT NULL,
    verdict TEXT NOT NULL,
    headline TEXT NOT NULL,
    why TEXT NOT NULL,
    concerns TEXT NOT NULL DEFAULT '[]',
    starred INTEGER NOT NULL DEFAULT 0,
    dismissed INTEGER NOT NULL DEFAULT 0,
    withdrawn_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (hunt_id, item_id)
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function migrate() {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export const now = () => new Date().toISOString();
