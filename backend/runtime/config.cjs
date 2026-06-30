"use strict";

/**
 * Runtime configuration — reads environment variables and exports a typed
 * config object consumed by all provider factories and the server.
 *
 * Auto-loads .env.<mode> from the project root (lower priority than shell env).
 *
 * Environment variables:
 *   APP_MODE          mock | local | dev          (default: mock)
 *   DB_TYPE           sqlite | postgres            (default: sqlite in mock/local, postgres in dev)
 *   DB_PATH           path to SQLite file          (default: .guardian-dev.db)
 *   DB_URL            postgres connection string   (required when DB_TYPE=postgres)
 *   USE_REAL_AWS      true | false                 (default: false)
 *   USE_REAL_AGENTCORE true | false               (default: false)
 *   USE_REAL_LLM      true | false                 (default: false)
 *   USE_MOCK_IDENTITY true | false                 (default: true unless APP_MODE=dev)
 *   PORT              API server port              (default: 4201)
 *   HOST              bind address                 (default: 0.0.0.0)
 */

const path = require("path");
// Load .env.<mode> — shell env takes priority (override: false)
const _mode = (process.env.APP_MODE || "mock").toLowerCase();
require("dotenv").config({ path: path.resolve(__dirname, `../../.env.${_mode}`), override: false });

const APP_MODE = _mode;

const defaults = {
  mock:  { dbType: "sqlite",   realAws: false, realAgentCore: false, realLlm: false, mockIdentity: true },
  local: { dbType: "postgres", realAws: false, realAgentCore: false, realLlm: false, mockIdentity: true },
  dev:   { dbType: "postgres", realAws: true,  realAgentCore: true,  realLlm: true,  mockIdentity: false },
};

const d = defaults[APP_MODE] || defaults.mock;

const bool = (envVar, fallback) =>
  process.env[envVar] !== undefined
    ? process.env[envVar].toLowerCase() === "true"
    : fallback;

const config = {
  appMode:         APP_MODE,
  dbType:          process.env.DB_TYPE || d.dbType,
  dbPath:          process.env.DB_PATH || ".guardian-dev.db",
  dbUrl:           process.env.DB_URL  || "postgres://guardian:guardian@localhost:5432/guardian_dev",
  useRealAws:      bool("USE_REAL_AWS",       d.realAws),
  useRealAgentCore:bool("USE_REAL_AGENTCORE", d.realAgentCore),
  useRealLlm:      bool("USE_REAL_LLM",       d.realLlm),
  useMockIdentity: bool("USE_MOCK_IDENTITY",  d.mockIdentity),
  port:            parseInt(process.env.PORT || "4201", 10),
  host:            process.env.HOST || "0.0.0.0",
};

console.log(`[runtime] mode=${config.appMode} db=${config.dbType} aws=${config.useRealAws ? "real" : "mock"} agentcore=${config.useRealAgentCore ? "real" : "mock"} llm=${config.useRealLlm ? "real" : "mock"} identity=${config.useMockIdentity ? "mock" : "real"}`);

module.exports = config;
