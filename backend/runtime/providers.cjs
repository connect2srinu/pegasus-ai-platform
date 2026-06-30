"use strict";

/**
 * Provider factory — wires up identity, AWS, AgentCore, and LLM providers
 * based on runtime config. All consumers import from here, never directly
 * from mock/real files, so swapping a provider only changes config.
 */

const config = require("./config.cjs");

const identity  = config.useMockIdentity
  ? require("./providers/identity/mock.cjs")
  : require("./providers/identity/mock.cjs"); // real identity TBD (Cognito/OIDC)

const aws       = config.useRealAws
  ? require("./providers/aws/real.cjs")
  : require("./providers/aws/mock.cjs");

const agentcore = config.useRealAgentCore
  ? require("./providers/agentcore/mock.cjs") // real delegates via gateway-deployer
  : require("./providers/agentcore/mock.cjs");

const llm       = config.useRealLlm
  ? require("./providers/llm/real.cjs")
  : require("./providers/llm/mock.cjs");

module.exports = { identity, aws, agentcore, llm };
