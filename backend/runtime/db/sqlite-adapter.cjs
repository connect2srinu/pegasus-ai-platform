"use strict";

/**
 * SQLite adapter using better-sqlite3 (synchronous API).
 * All public methods are async to keep the same interface as the Postgres adapter.
 */

const Database = require("better-sqlite3");
const fs       = require("fs");
const path     = require("path");

const SCHEMA_PATH = path.join(__dirname, "schema.sql");

class SqliteAdapter {
  constructor(dbPath) {
    this._db = new Database(dbPath);
    this._db.pragma("journal_mode = WAL");
    this._db.pragma("foreign_keys = ON");
    this._applySchema();
  }

  _applySchema() {
    const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
    // Split on statement boundaries but skip PRAGMA (already applied)
    const stmts = sql.split(";").map(s => s.trim()).filter(s => s && !s.startsWith("PRAGMA") && !s.startsWith("--"));
    for (const stmt of stmts) {
      try { this._db.prepare(stmt).run(); } catch (e) {
        if (!e.message.includes("already exists") && !e.message.includes("duplicate column name")) throw e;
      }
    }
  }

  // ── Generic query helpers ─────────────────────────────────────────────────

  async query(sql, params = []) {
    const stmt = this._db.prepare(sql);
    const rows = stmt.all(...params);
    return { rows };
  }

  async queryOne(sql, params = []) {
    const stmt = this._db.prepare(sql);
    return stmt.get(...params) || null;
  }

  async run(sql, params = []) {
    const stmt = this._db.prepare(sql);
    return stmt.run(...params);
  }

  // ── Transaction ───────────────────────────────────────────────────────────

  async transaction(fn) {
    return this._db.transaction(fn)();
  }

  // ── Upsert helper (INSERT OR REPLACE) ────────────────────────────────────

  async upsert(table, obj) {
    const keys   = Object.keys(obj);
    const cols   = keys.join(", ");
    const phs    = keys.map(() => "?").join(", ");
    const vals   = keys.map(k => obj[k]);
    const sql    = `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${phs})`;
    return this.run(sql, vals);
  }

  close() { this._db.close(); }
}

module.exports = SqliteAdapter;
