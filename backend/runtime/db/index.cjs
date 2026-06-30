"use strict";

const config = require("../config.cjs");

let _db = null;

async function getDb() {
  if (_db) return _db;

  if (config.dbType === "postgres") {
    const PostgresAdapter = require("./postgres-adapter.cjs");
    _db = await new PostgresAdapter(config.dbUrl).init();
  } else {
    const SqliteAdapter = require("./sqlite-adapter.cjs");
    _db = new SqliteAdapter(config.dbPath);
  }

  console.log(`[db] Using ${config.dbType} (${config.dbType === "sqlite" ? config.dbPath : config.dbUrl.replace(/:[^@]+@/, ":***@")})`);
  return _db;
}

module.exports = { getDb };
