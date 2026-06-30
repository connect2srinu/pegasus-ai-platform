"use strict";

/**
 * AWS credential and identity resolution for local single-account testing mode.
 *
 * When LOCAL_AWS_MODE=true, the server resolves the real AWS account ID and region
 * from the default credential provider chain (~/.aws/credentials, env vars, instance
 * profile). No account IDs, regions, or role ARNs are hardcoded here.
 *
 * This module is the single source of truth for "what account are we running against."
 */

const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { fromIni, fromEnv, fromNodeProviderChain } = require("@aws-sdk/credential-providers");

// ── Resolved at startup, cached for the process lifetime ─────────────────────

let _cached = null;
let _resolved = false;

/**
 * Resolve the local AWS context once at startup.
 * Returns { accountId, region, callerArn, userType } or null if not in local mode.
 *
 * Resolution order for credentials:
 *   1. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars
 *   2. AWS_PROFILE env var (specific named profile)
 *   3. ~/.aws/credentials [default] profile
 *   4. EC2/ECS instance metadata (if running on AWS)
 *
 * Resolution order for region:
 *   1. AWS_REGION env var
 *   2. AWS_DEFAULT_REGION env var
 *   3. Falls back to us-east-1 with a warning
 */
async function resolveLocalAwsContext() {
  if (_resolved) return _cached;
  _resolved = true;

  const awsEnabled = process.env.LOCAL_AWS_MODE === "true"
    || process.env.USE_REAL_AWS === "true"
    || process.env.USE_REAL_AGENTCORE === "true";
  if (!awsEnabled) {
    _cached = null;
    return null;
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    console.warn("[aws-client] AWS_REGION not set — defaulting to us-east-1. Set AWS_REGION in .env.local to override.");
  }

  try {
    const credentials = fromNodeProviderChain();
    const sts = new STSClient({ region, credentials });
    const identity = await sts.send(new GetCallerIdentityCommand({}));

    const accountId = identity.Account;
    const callerArn = identity.Arn;
    // Determine user type from ARN shape
    const userType = callerArn.includes(":assumed-role/") ? "assumed-role"
      : callerArn.includes(":user/") ? "iam-user"
      : callerArn.includes(":root") ? "root"
      : "unknown";

    _cached = { accountId, region, callerArn, userType };

    console.log(`[aws-client] Local AWS mode active.`);
    console.log(`[aws-client]   Account : ${accountId}`);
    console.log(`[aws-client]   Region  : ${region}`);
    console.log(`[aws-client]   Caller  : ${callerArn}`);

    return _cached;
  } catch (err) {
    console.error("[aws-client] ERROR: Could not resolve AWS identity. Check ~/.aws/credentials and AWS_REGION.");
    console.error(`[aws-client]   ${err.message}`);
    _cached = null;
    return null;
  }
}

/**
 * Returns the cached local AWS context, or null.
 * Must call resolveLocalAwsContext() at startup before using this.
 */
function getLocalAwsContext() {
  return _cached;
}

/**
 * Returns true if LOCAL_AWS_MODE=true and credentials resolved successfully.
 */
function isLocalAwsMode() {
  return _cached !== null;
}

/**
 * Build an org-level awsConfig using the local account for both model and execution accounts.
 * In single-account local mode, both point at the same account.
 */
function buildSingleAccountAwsConfig(accountId, region) {
  return {
    modelAccount: {
      accountId,
      region,
      label: "Local Dev — Bedrock Model Account (same account)",
      crossAccountRoleArn: null,
      allowedModelIds: [], // populated later by bedrock-client
    },
    executionAccount: {
      accountId,
      region,
      label: "Local Dev — AgentCore Execution Account (same account)",
      agentCoreExecutionRoleArn: `arn:aws:iam::${accountId}:role/AgentCoreExecutionRole`,
      ecrRepositoryPrefix: `${accountId}.dkr.ecr.${region}.amazonaws.com/pegasus`,
      s3ArtifactBucket: `pegasus-agent-artifacts-${accountId}`,
      networkConfig: null, // not required for basic AgentCore deployment
    },
  };
}

/**
 * Create an STS client using the default credential chain.
 * Re-usable by other service modules.
 */
function makeStsClient() {
  const ctx = getLocalAwsContext();
  if (!ctx) throw new Error("Local AWS context not resolved. Call resolveLocalAwsContext() first.");
  return new STSClient({ region: ctx.region, credentials: fromNodeProviderChain() });
}

module.exports = {
  resolveLocalAwsContext,
  getLocalAwsContext,
  isLocalAwsMode,
  buildSingleAccountAwsConfig,
  makeStsClient,
};
