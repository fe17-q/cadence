import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'cadence.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  canvas_base_url TEXT,
  canvas_token TEXT,
  canvas_course_ids TEXT,          -- JSON array of course ids
  ical_url TEXT,
  ical_filter TEXT,                -- optional course-name filter for iCal feed
  last_synced_at TEXT,
  sync_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memberships (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- owner | member
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, user_id)
);
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  source TEXT NOT NULL,            -- canvas | ical | manual
  external_id TEXT,
  title TEXT NOT NULL,
  description_html TEXT,
  due_at TEXT,
  points REAL,
  html_url TEXT,
  course_name TEXT,
  attachments TEXT,                -- JSON [{name,url}]
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (team_id, source, external_id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_at TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  position REAL NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keys TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sent_reminders (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignment ON tasks(assignment_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_assign_team ON assignments(team_id, due_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);
`);

// lightweight migrations
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
const addCol = (t, c, type = 'TEXT') => { if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type}`); };
addCol('teams', 'tz');
for (const c of ['google_refresh_token', 'google_email', 'google_connected_by', 'google_folder_id', 'google_folder_url', 'google_folder_name', 'google_error']) addCol('teams', c);
addCol('assignments', 'google_folder_id');
addCol('users', 'google_email');
db.exec(`
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,          -- doc | sheet | slides | form | drawing | folder | file | pdf | link
  google_id TEXT,
  source TEXT NOT NULL,        -- link | picked | created
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_team ON docs(team_id, created_at);
`);

export const id = () => crypto.randomUUID();
export const token = (n = 32) => crypto.randomBytes(n).toString('base64url');

export const one = (sql, ...a) => db.prepare(sql).get(...a);
export const all = (sql, ...a) => db.prepare(sql).all(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function kvGet(key) { return one('SELECT value FROM kv WHERE key = ?', key)?.value; }
export function kvSet(key, value) {
  run('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
}
