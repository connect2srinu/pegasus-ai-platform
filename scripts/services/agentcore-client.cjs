"use strict";

/**
 * AgentCore service client — Phase C real AWS integration.
 *
 * Wraps BedrockAgentCoreControlClient (create/get/delete runtimes and endpoints)
 * and BedrockAgentCoreClient (invoke) using the default credential provider chain.
 *
 * Deploy flow for local single-account testing:
 *   1. Upload agent code bundle to S3 (codeConfiguration path — no Docker needed)
 *   2. CreateAgentRuntime with codeConfiguration pointing at that S3 key
 *   3. Poll GetAgentRuntime until status = READY
 *   4. CreateAgentRuntimeEndpoint with networkMode = PUBLIC
 *   5. Poll GetAgentRuntimeEndpoint until status = READY
 *   6. InvokeAgentRuntime via endpoint URL
 */

const {
  BedrockAgentCoreControlClient,
  CreateAgentRuntimeCommand,
  GetAgentRuntimeCommand,
  DeleteAgentRuntimeCommand,
  CreateAgentRuntimeEndpointCommand,
  GetAgentRuntimeEndpointCommand,
  ListAgentRuntimesCommand,
} = require("@aws-sdk/client-bedrock-agentcore-control");

const {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} = require("@aws-sdk/client-bedrock-agentcore");

const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { fromNodeProviderChain } = require("@aws-sdk/credential-providers");
const { getLocalAwsContext } = require("./aws-client.cjs");

// ── Shared client factory ─────────────────────────────────────────────────────

function makeControlClient() {
  const ctx = getLocalAwsContext();
  if (!ctx) throw new Error("Local AWS context not resolved.");
  return new BedrockAgentCoreControlClient({
    region: ctx.region,
    credentials: fromNodeProviderChain(),
  });
}

function makeDataClient() {
  const ctx = getLocalAwsContext();
  if (!ctx) throw new Error("Local AWS context not resolved.");
  return new BedrockAgentCoreClient({
    region: ctx.region,
    credentials: fromNodeProviderChain(),
  });
}

function makeS3Client() {
  const ctx = getLocalAwsContext();
  if (!ctx) throw new Error("Local AWS context not resolved.");
  return new S3Client({ region: ctx.region, credentials: fromNodeProviderChain() });
}

// ── Polling helper ────────────────────────────────────────────────────────────

async function pollUntil(fn, isReady, { intervalMs = 4000, maxAttempts = 30, label = "resource" } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn();
    const status = result.status || result.agentRuntimeStatus || result.endpointStatus || "UNKNOWN";
    if (isReady(status, result)) return result;
    if (status === "FAILED" || status === "CREATE_FAILED") {
      throw new Error(`${label} reached FAILED state: ${JSON.stringify(result.failureReasons || result.statusReasons || [])}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`${label} did not become ready after ${maxAttempts} attempts.`);
}

// ── S3 upload ─────────────────────────────────────────────────────────────────

/**
 * Upload agent code to S3.
 * @param {string} bucket
 * @param {string} s3Key   e.g. "agents/my-agent/0.1.0/agent.py"
 * @param {Buffer|string} body  The agent code content
 * @returns {Promise<{bucket, s3Key}>}
 */
async function uploadAgentCode(bucket, s3Key, body) {
  const s3 = makeS3Client();
  const isZip = s3Key.endsWith(".zip");
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: typeof body === "string" ? Buffer.from(body, "utf8") : body,
    ContentType: isZip ? "application/zip" : "text/x-python",
  }));
  return { bucket, s3Key };
}

// ── Runtime lifecycle ─────────────────────────────────────────────────────────

/**
 * Create an AgentCore Runtime using S3-hosted code (no Docker required).
 *
 * @param {object} params
 * @param {string} params.name           AgentCore runtime name (alphanum + underscore, start with letter)
 * @param {string} params.roleArn        AgentCoreExecutionRole ARN
 * @param {string} params.bucket         S3 bucket for code
 * @param {string} params.s3Prefix       S3 key prefix for agent code (e.g. "agents/my-agent/0.1.0/")
 * @param {string[]} params.entryPoint   e.g. ["python", "agent.py"] or ["python", "-m", "agent"]
 * @param {string} params.pythonRuntime  e.g. "PYTHON_3_12"
 * @param {string} [params.description]
 * @param {object} [params.environmentVariables]
 * @returns {Promise<{agentRuntimeId, agentRuntimeArn, status}>}
 */
async function createAgentRuntime({
  name, roleArn, bucket, s3Prefix, entryPoint,
  pythonRuntime = "PYTHON_3_12", description, environmentVariables = {},
}) {
  const client = makeControlClient();

  const input = {
    agentRuntimeName: name,
    agentRuntimeArtifact: {
      codeConfiguration: {
        code: {
          s3: {
            bucket,
            prefix: s3Prefix,
          },
        },
        runtime: pythonRuntime,
        entryPoint: entryPoint,
      },
    },
    roleArn,
    networkConfiguration: {
      networkMode: "PUBLIC",
    },
    ...(description && { description }),
    ...(Object.keys(environmentVariables).length && { environmentVariables }),
  };

  try {
    const response = await client.send(new CreateAgentRuntimeCommand(input));
    return {
      agentRuntimeId: response.agentRuntimeId,
      agentRuntimeArn: response.agentRuntimeArn,
      status: response.status || "CREATING",
      workloadIdentityDetails: response.workloadIdentityDetails,
    };
  } catch (err) {
    // Runtime with this name already exists — delete it and recreate with fresh code
    if (err.message?.includes("already exists")) {
      console.log(`[agentcore-client] Runtime '${name}' already exists — deleting for fresh deploy`);
      const all = await listAgentRuntimes();
      const existing = all.find((r) => r.agentRuntimeName === name);
      if (existing) {
        console.log(`[agentcore-client] Deleting runtime ${existing.agentRuntimeId}…`);
        await deleteAgentRuntime(existing.agentRuntimeId);
        console.log(`[agentcore-client] Deleted. Recreating runtime '${name}'…`);
        const retry = await makeControlClient().send(new CreateAgentRuntimeCommand(input));
        return {
          agentRuntimeId: retry.agentRuntimeId,
          agentRuntimeArn: retry.agentRuntimeArn,
          status: retry.status || "CREATING",
        };
      }
    }
    throw err;
  }
}

/**
 * Poll GetAgentRuntime until status = READY.
 * @returns {Promise<{agentRuntimeId, agentRuntimeArn, status}>}
 */
async function waitForRuntimeReady(agentRuntimeId, { intervalMs = 5000, maxAttempts = 36 } = {}) {
  const client = makeControlClient();
  return pollUntil(
    () => client.send(new GetAgentRuntimeCommand({ agentRuntimeId })),
    (status) => status === "READY",
    { intervalMs, maxAttempts, label: `AgentRuntime ${agentRuntimeId}` }
  );
}

/**
 * Get current status of an AgentCore Runtime.
 */
async function getAgentRuntime(agentRuntimeId) {
  const client = makeControlClient();
  return client.send(new GetAgentRuntimeCommand({ agentRuntimeId }));
}

/**
 * Delete an AgentCore Runtime and wait until it is gone.
 */
async function deleteAgentRuntime(agentRuntimeId) {
  const client = makeControlClient();
  await client.send(new DeleteAgentRuntimeCommand({ agentRuntimeId }));
  // Poll until the runtime is gone (404 or DELETED status)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const r = await client.send(new GetAgentRuntimeCommand({ agentRuntimeId }));
      const s = r.status || r.agentRuntimeStatus || "";
      if (s === "DELETED" || s === "DELETE_COMPLETE") return;
    } catch (e) {
      if (e.name === "ResourceNotFoundException" || e.$metadata?.httpStatusCode === 404) return;
    }
  }
  throw new Error(`Runtime ${agentRuntimeId} did not finish deleting after 2.5 min.`);
}

/**
 * List all AgentCore Runtimes in the account/region.
 */
async function listAgentRuntimes() {
  const client = makeControlClient();
  const response = await client.send(new ListAgentRuntimesCommand({}));
  return response.agentRuntimes || [];
}

// ── Endpoint lifecycle ────────────────────────────────────────────────────────

/**
 * Create a PUBLIC endpoint for an AgentCore Runtime.
 * @param {string} agentRuntimeId
 * @param {string} endpointName
 * @returns {Promise<{agentRuntimeEndpointId, agentRuntimeEndpointArn, liveVersion, status}>}
 */
async function createRuntimeEndpoint(agentRuntimeId, endpointName) {
  const client = makeControlClient();
  try {
    const response = await client.send(new CreateAgentRuntimeEndpointCommand({
      agentRuntimeId,
      name: endpointName,
    }));
    // SDK uses the endpoint name as the stable identifier; agentRuntimeEndpointId may be undefined.
    return {
      agentRuntimeEndpointId: response.agentRuntimeEndpointId || endpointName,
      agentRuntimeEndpointArn: response.agentRuntimeEndpointArn,
      liveVersion: response.liveVersion,
      status: response.status || "CREATING",
    };
  } catch (err) {
    // Endpoint already exists (e.g. runtime was reused) — return name as identifier and let polling confirm READY
    if (err.message?.includes("already exists")) {
      console.log(`[agentcore-client] Endpoint '${endpointName}' already exists — reusing`);
      return { agentRuntimeEndpointId: endpointName, status: "CREATING" };
    }
    throw err;
  }
}

/**
 * Poll GetAgentRuntimeEndpoint until status = READY.
 * The SDK requires endpointName (the name you supplied at creation), not a generated ID.
 */
async function waitForEndpointReady(agentRuntimeId, endpointName, { intervalMs = 5000, maxAttempts = 36 } = {}) {
  const client = makeControlClient();
  return pollUntil(
    () => client.send(new GetAgentRuntimeEndpointCommand({ agentRuntimeId, endpointName })),
    (status) => status === "READY",
    { intervalMs, maxAttempts, label: `Endpoint ${endpointName}` }
  );
}

/**
 * Get current status of a Runtime Endpoint by its name.
 */
async function getRuntimeEndpoint(agentRuntimeId, endpointName) {
  const client = makeControlClient();
  return client.send(new GetAgentRuntimeEndpointCommand({ agentRuntimeId, endpointName }));
}

// ── Invocation ────────────────────────────────────────────────────────────────

/**
 * Invoke an AgentCore Runtime via its endpoint.
 * @param {string} agentRuntimeArn   Full ARN of the runtime (required by InvokeAgentRuntimeCommand)
 * @param {string} endpointName      The endpoint name used at creation (SDK HTTP label)
 * @param {object} payload           The input payload to send to the agent
 * @returns {Promise<{output, sessionId, httpStatusCode}>}
 */
async function invokeAgentRuntime(agentRuntimeArn, endpointName, payload) {
  const client = makeDataClient();

  const bodyStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  const response = await client.send(new InvokeAgentRuntimeCommand({
    agentRuntimeArn,
    endpointName,
    payload: bodyStr,
  }));

  // Response body is a streaming blob — collect it
  let outputStr = "";
  if (response.output) {
    if (typeof response.output === "string") {
      outputStr = response.output;
    } else if (response.output.transformToString) {
      outputStr = await response.output.transformToString();
    } else if (Buffer.isBuffer(response.output)) {
      outputStr = response.output.toString("utf8");
    }
  }

  let output;
  try { output = JSON.parse(outputStr); } catch { output = outputStr; }

  return {
    output,
    rawOutput: outputStr,
    sessionId: response.sessionId,
    httpStatusCode: response.$metadata?.httpStatusCode,
  };
}

// ── Full deploy pipeline (used by deploy route) ───────────────────────────────

/**
 * Full deploy: upload code → create runtime → wait → create endpoint → wait.
 * Emits progress events via onLog(message) callback for streaming to deployment logs.
 *
 * @param {object} params
 * @param {string} params.runtimeName       AgentCore runtime name
 * @param {string} params.roleArn
 * @param {string} params.bucket            S3 bucket
 * @param {string} params.s3Prefix          e.g. "agents/my-agent/0.1.0/"
 * @param {string|Buffer} params.agentCode  Python source code
 * @param {string} params.entryFileName     e.g. "agent.py"
 * @param {string[]} params.entryPoint      e.g. ["python", "agent.py"]
 * @param {string} [params.pythonRuntime]
 * @param {string} [params.description]
 * @param {object} [params.environmentVariables]
 * @param {Function} [params.onLog]         (message: string) => void
 * @returns {Promise<{agentRuntimeId, agentRuntimeArn, agentRuntimeEndpointId, status: "READY"}>}
 */
async function deployAgent({
  runtimeName, roleArn, bucket, s3Prefix, agentCode, entryFileName = "agent.py",
  entryPoint = ["harness.py"], pythonRuntime = "PYTHON_3_12",
  description, environmentVariables = {}, onLog = () => {},
}) {
  const log = (msg) => { console.log(`[agentcore-client] ${msg}`); onLog(`[${new Date().toISOString()}] ${msg}`); };

  // 1. Upload code to S3
  const s3Key = `${s3Prefix}${entryFileName}`;
  log(`Uploading agent code to s3://${bucket}/${s3Key}`);
  await uploadAgentCode(bucket, s3Key, agentCode);
  log(`Code uploaded.`);

  // 2. Create runtime
  log(`Creating AgentCore Runtime: ${runtimeName}`);
  const { agentRuntimeId, agentRuntimeArn, status: createStatus } = await createAgentRuntime({
    name: runtimeName, roleArn, bucket, s3Prefix, entryPoint, pythonRuntime, description, environmentVariables,
  });
  log(`Runtime created. ID: ${agentRuntimeId}  Status: ${createStatus}`);

  // 3. Wait for READY
  log(`Waiting for runtime to become READY…`);
  await waitForRuntimeReady(agentRuntimeId);
  log(`Runtime is READY.`);

  // 4. Create endpoint
  const endpointName = `${runtimeName}Ep`;
  log(`Creating endpoint: ${endpointName}`);
  const { agentRuntimeEndpointId, status: epCreateStatus } = await createRuntimeEndpoint(agentRuntimeId, endpointName);
  log(`Endpoint created. ID: ${agentRuntimeEndpointId}  Status: ${epCreateStatus}`);

  // 5. Wait for endpoint READY
  log(`Waiting for endpoint to become READY…`);
  await waitForEndpointReady(agentRuntimeId, agentRuntimeEndpointId);
  log(`Endpoint is READY. Runtime ARN: ${agentRuntimeArn}`);

  return {
    agentRuntimeId,
    agentRuntimeArn,
    agentRuntimeEndpointId,
    s3CodeLocation: `s3://${bucket}/${s3Key}`,
    status: "READY",
  };
}

module.exports = {
  uploadAgentCode,
  createAgentRuntime,
  waitForRuntimeReady,
  getAgentRuntime,
  deleteAgentRuntime,
  listAgentRuntimes,
  createRuntimeEndpoint,
  waitForEndpointReady,
  getRuntimeEndpoint,
  invokeAgentRuntime,
  deployAgent,
};
