import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const VAULT_DIR = path.resolve(process.cwd(), 'storage', 'vault');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
}

export const VAULT_DIRECTORY = VAULT_DIR;

export const db = new Database(path.join(DATA_DIR, 'mediscan.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    verification_token_hash TEXT,
    verification_expires_at TEXT,
    reset_token_hash TEXT,
    reset_expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    module_type TEXT NOT NULL,
    sub_type TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    patient_age TEXT NOT NULL DEFAULT '',
    patient_sex TEXT NOT NULL DEFAULT '',
    report_date_label TEXT NOT NULL DEFAULT '',
    clinical_notes TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    vault_file_name TEXT NOT NULL,
    file_iv TEXT NOT NULL,
    file_auth_tag TEXT NOT NULL,
    status TEXT NOT NULL,
    analysis_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at DESC);
`);

export interface DbUserRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  email_verified: number;
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  reset_token_hash: string | null;
  reset_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbReportRow {
  id: string;
  user_id: string;
  module_type: string;
  sub_type: string;
  patient_name: string;
  patient_age: string;
  patient_sex: string;
  report_date_label: string;
  clinical_notes: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  vault_file_name: string;
  file_iv: string;
  file_auth_tag: string;
  status: string;
  analysis_json: string;
  created_at: string;
}
