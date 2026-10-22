// Thin data-access layer over the built-in node:sqlite driver.
// All SQL goes through these helpers so the store can later be swapped for PostgreSQL.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, '../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = process.env.MOE_DB || path.join(DATA_DIR, 'moe.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let db;
export function open({ fresh = false } = {}) {
  if (fresh) {
    for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) fs.rmSync(f, { force: true });
  }
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (fresh) db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  return db;
}

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
export const exec = (sql) => db.exec(sql);

let depth = 0;
// Serialised write transaction. BEGIN IMMEDIATE takes the write lock up-front so two
// competing requests for the last seat cannot both read "1 seat available" (CC-05).
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export function insert(table, obj) {
  const keys = Object.keys(obj);
  const r = run(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    ...keys.map((k) => norm(obj[k]))
  );
  return Number(r.lastInsertRowid);
}

export function update(table, id, obj, idCol = 'id') {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idCol} = ?`, ...keys.map((k) => norm(obj[k])), id);
}

function norm(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

export const parse = (s, d = null) => {
  if (s == null) return d;
  try { return JSON.parse(s); } catch { return d; }
};
