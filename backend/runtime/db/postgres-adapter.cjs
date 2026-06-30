"use strict";

/**
 * Postgres adapter using the `pg` pool.
 * Interface matches SqliteAdapter so providers are DB-agnostic.
 */

const { Pool } = require("pg");
const fs       = require("fs");
const path     = require("path");

const SCHEMA_PATH = path.join(__dirname, "schema-postgres.sql");

class PostgresAdapter {
  constructor(connectionString) {
    this._pool = new Pool({ connectionString });
  }

  async init() {
    const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
    const client = await this._pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
    return this;
  }

  // ── Generic query helpers ─────────────────────────────────────────────────

  async query(sql, params = []) {
    // pg uses $1 $2 placeholders, but we write queries with ? — convert
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++i}`);
    return this._pool.query(pgSql, params);
  }

  async queryOne(sql, params = []) {
    const { rows } = await this.query(sql, params);
    return rows[0] || null;
  }

  async run(sql, params = []) {
    return this.query(sql, params);
  }

  // ── Transaction ───────────────────────────────────────────────────────────

  async transaction(fn) {
    const client = await this._pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // ── Upsert (INSERT ... ON CONFLICT DO UPDATE) ─────────────────────────────

  async upsert(table, obj) {
    const keys     = Object.keys(obj);
    let i          = 0;
    const cols     = keys.join(", ");
    const phs      = keys.map(() => `$${++i}`).join(", ");
    const updates  = keys.filter(k => k !== "id").map(k => `${k} = EXCLUDED.${k}`).join(", ");
    const vals     = keys.map(k => obj[k]);
    const sql      = `INSERT INTO ${table} (${cols}) VALUES (${phs}) ON CONFLICT (id) DO UPDATE SET ${updates}`;
    return this._pool.query(sql, vals);
  }

  async close() { await this._pool.end(); }
}

module.exports = PostgresAdapter;
