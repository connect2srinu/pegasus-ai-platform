"use strict";

/**
 * AgentCore Gateway deployment service.
 *
 * Handles creating/finding a Gateway for an org environment, registering tool
 * targets (Lambda or API Gateway), and granting the Gateway invoke permission
 * on each Lambda. All AWS calls use the connection's deploymentRoleArn via STS
 * AssumeRole — the platform never uses raw user credentials for deployment.
 */

const { STSClient, AssumeRoleCommand } = require("@aws-sdk/client-sts");
const { ensureWrapperLambda, wrapperFunctionName } = require("./wrapper-deployer.cjs");
const {
  BedrockAgentCoreControlClient,
  CreateGatewayCommand,
  ListGatewaysCommand,
  GetGatewayCommand,
  DeleteGatewayCommand,
  CreateGatewayTargetCommand,
  GetGatewayTargetCommand,
  ListGatewayTargetsCommand,
} = require("@aws-sdk/client-bedrock-agentcore-control");
const { LambdaClient, AddPermissionCommand } = require("@aws-sdk/client-lambda");

// ── ARN helpers ───────────────────────────────────────────────────────────────

// Lambda ARNs from the console/discovery use "function/" but the SDK requires "function:"
function normalizeLambdaArn(arn) {
  return (arn || "").replace(/(:function)\/([^:/]+)$/, "$1:$2");
}

// AgentCore Gateway ARN — the SDK often doesn't echo it back in Create/Get responses
function buildGatewayArn(conn, gatewayId) {
  const region  = conn.region || "us-east-1";
  const account = conn.awsAccountId;
  if (!account) return null;
  return `arn:aws:bedrock-agentcore:${region}:${account}:gateway/${gatewayId}`;
}

// ── Credential helper ─────────────────────────────────────────────────────────

async function assumeDeploymentRole(conn) {
  const roleArn = conn.deploymentRoleArn || conn.provisioningRoleArn;
  if (!roleArn) throw new Error(`No deploymentRoleArn on connection ${conn.id}`);
  const region = conn.region || "us-east-1";
  const sts = new STSClient({ region });
  const r = await sts.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `guardian-deploy-${Date.now()}`,
    DurationSeconds: 900,
  }));
  return {
    credentials: {
      accessKeyId: r.Credentials.AccessKeyId,
      secretAccessKey: r.Credentials.SecretAccessKey,
      sessionToken: r.Credentials.SessionToken,
    },
    region,
  };
}

// ── Gateway helpers ───────────────────────────────────────────────────────────

function gatewayName(conn) {
  // Must match ([0-9a-zA-Z][-]?){1,48} — no underscores, no consecutive hyphens
  const orgSlug = (conn.organizationId || "org").replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 20);
  const envSlug = (conn.environmentType || "dev").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4);
  return `guardian-${orgSlug}-${envSlug}`.slice(0, 48);
}

/**
 * Find or create the AgentCore MCP Gateway for the given account connection.
 * Returns { gatewayId, gatewayArn, gatewayUrl }.
 * The caller is responsible for persisting these back onto the connection record.
 */
async function ensureGateway(conn) {
  const { credentials, region } = await assumeDeploymentRole(conn);
  const client = new BedrockAgentCoreControlClient({ region, credentials });
  const name = gatewayName(conn);

  // Check if we already have a stored gateway ARN on the connection
  if (conn.agentCoreGatewayArn && conn.agentCoreGatewayId) {
    try {
      const gw = await client.send(new GetGatewayCommand({ gatewayIdentifier: conn.agentCoreGatewayId }));
      if (gw.status !== "DELETING" && gw.status !== "FAILED") {
        return { gatewayId: conn.agentCoreGatewayId, gatewayArn: conn.agentCoreGatewayArn, gatewayUrl: conn.agentCoreGatewayUrl };
      }
    } catch (_) { /* gateway gone — fall through to create */ }
  }

  // Search existing gateways for one matching this connection
  let nextToken;
  do {
    const list = await client.send(new ListGatewaysCommand({ nextToken }));
    for (const gw of (list.items || [])) {
      if (gw.name !== name) continue;
      if (gw.status === "FAILED") {
        console.log(`[gateway-deployer] Deleting FAILED gateway ${gw.gatewayId} (${name}) to retry creation`);
        try { await client.send(new DeleteGatewayCommand({ gatewayIdentifier: gw.gatewayId })); } catch (_) {}
        continue;
      }
      if (gw.status !== "DELETING") {
        return {
          gatewayId:  gw.gatewayId,
          gatewayArn: gw.gatewayArn || buildGatewayArn(conn, gw.gatewayId),
          gatewayUrl: gw.gatewayUrl,
        };
      }
    }
    nextToken = list.nextToken;
  } while (nextToken);

  // Create a new Gateway
  const roleArn = conn.deploymentRoleArn || conn.provisioningRoleArn;
  const created = await client.send(new CreateGatewayCommand({
    name,
    roleArn,
    authorizerType: "NONE",
    protocolType: "MCP",
  }));
  const gwId  = created.gatewayId;
  const gwArn = created.gatewayArn || buildGatewayArn(conn, gwId);
  const gwUrl = created.gatewayUrl;
  console.log(`[gateway-deployer] Created Gateway ${gwId} arn=${gwArn} (${name}) for ${conn.organizationId} — waiting for READY`);

  // Poll until READY or FAILED (typically 10–30 seconds)
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await client.send(new GetGatewayCommand({ gatewayIdentifier: gwId }));
    console.log(`[gateway-deployer] Gateway ${gwId} status: ${status.status} (attempt ${i + 1}/20)`);
    if (status.status === "READY") {
      console.log(`[gateway-deployer] Gateway ${gwId} is READY`);
      return {
        gatewayId:  gwId,
        gatewayArn: status.gatewayArn || gwArn,
        gatewayUrl: status.gatewayUrl || gwUrl,
      };
    }
    if (status.status === "FAILED") {
      const reasons = (status.statusReasons || []).join("; ");
      throw new Error(`Gateway ${gwId} reached FAILED status: ${reasons}`);
    }
  }
  throw new Error(`Gateway ${gwId} did not reach READY after 100 seconds`);
}

// ── Tool schema derivation ────────────────────────────────────────────────────

/**
 * Build the inlinePayload tool schema for the Gateway target from an LTD.
 * Uses the stored inputSchemaJson if available; otherwise generates a minimal schema.
 */
function deriveToolSchema(ltd) {
  // Try to use the stored schema
  if (ltd.inputSchemaJson) {
    try {
      const parsed = JSON.parse(ltd.inputSchemaJson);
      // Already in inlinePayload format?
      if (Array.isArray(parsed)) return parsed;
      // Single tool schema object
      return [{ name: ltd.toolKey, description: ltd.description || ltd.displayName, inputSchema: parsed }];
    } catch (_) { /* fall through */ }
  }

  // Minimal schema — agents can call the tool with any payload until a real schema is registered
  return [{
    name: ltd.toolKey,
    description: ltd.description || ltd.displayName || ltd.toolKey,
    inputSchema: {
      type: "object",
      properties: {
        payload: { type: "object", description: "Tool-specific input payload" },
      },
    },
  }];
}

// ── Lambda resource-based policy ──────────────────────────────────────────────

async function addLambdaInvokePermission(lambdaArn, gatewayArn, conn) {
  const { credentials, region } = await assumeDeploymentRole(conn);
  const lambda = new LambdaClient({ region, credentials });
  // Use gatewayId tail for a stable, idempotent statement ID
  const tail = gatewayArn ? gatewayArn.split("/").pop().replace(/[^a-zA-Z0-9]/g, "-") : "agentcore";
  const statementId = `GuardianAgentCore-${tail}`.slice(0, 100);
  const permParams = {
    FunctionName: lambdaArn,
    StatementId: statementId,
    Action: "lambda:InvokeFunction",
    Principal: "bedrock-agentcore.amazonaws.com",
  };
  if (gatewayArn) permParams.SourceArn = gatewayArn;
  else console.warn(`[gateway-deployer] No gatewayArn available — adding open invoke permission for ${lambdaArn}`);
  try {
    await lambda.send(new AddPermissionCommand(permParams));
    console.log(`[gateway-deployer] Added Lambda invoke permission: ${statementId}`);
  } catch (e) {
    if (e.name === "ResourceConflictException") {
      console.log(`[gateway-deployer] Lambda invoke permission already exists: ${statementId}`);
    } else {
      throw e;
    }
  }
}

// ── Target deployment ─────────────────────────────────────────────────────────

/**
 * Check if a Gateway Target already exists for this LTD on the given gateway.
 */
async function findExistingTarget(client, gatewayId, toolKey) {
  let nextToken;
  do {
    const r = await client.send(new ListGatewayTargetsCommand({ gatewayIdentifier: gatewayId, nextToken }));
    const found = (r.items || []).find((t) => t.name === toolKey || t.name === toolKey.replace(/_/g, "-"));
    if (found) return found;
    nextToken = r.nextToken;
  } while (nextToken);
  return null;
}

/**
 * Deploy a logical tool definition to an AgentCore Gateway as an MCP target.
 * Supports Lambda and API Gateway source types.
 *
 * For API_GATEWAY: auto-deploys a thin MCP-protocol Lambda wrapper that proxies
 * HTTP calls to the API Gateway endpoint, then registers the wrapper Lambda as
 * the Gateway target.
 *
 * Accepts optional `discoveredResources` array for API Gateway URL resolution.
 *
 * Returns { targetId, gatewayId, gatewayArn, gatewayUrl, mcpToolName, wrapperLambdaArn? }.
 */
async function deployTool({ ltd, etd, conn, discoveredResources }) {
  const sourceArn = normalizeLambdaArn(etd.sourceResourceArn || ltd.sourceResourceArn);
  if (!sourceArn) {
    throw new Error(`No sourceResourceArn on ETD ${etd.id} — cannot deploy to Gateway.`);
  }

  const { credentials, region } = await assumeDeploymentRole(conn);
  const client = new BedrockAgentCoreControlClient({ region, credentials });

  // Step 1: Ensure Gateway exists
  const { gatewayId, gatewayArn, gatewayUrl } = await ensureGateway(conn);

  // Step 2: Check for existing target (idempotent)
  const existing = await findExistingTarget(client, gatewayId, ltd.toolKey);
  if (existing && existing.status !== "FAILED") {
    console.log(`[gateway-deployer] Target already exists: ${existing.targetId} for ${ltd.toolKey}`);
    return {
      targetId: existing.targetId,
      gatewayId,
      gatewayArn,
      gatewayUrl,
      mcpToolName: ltd.toolKey,
      status: existing.status,
    };
  }

  // Step 3: Build target configuration
  const toolSchema = deriveToolSchema(ltd);
  const sourceType = ltd.sourceType || etd.sourceResourceType || "LAMBDA";
  let targetConfiguration;
  let wrapperLambdaArn = null;
  let lambdaArn = normalizeLambdaArn(sourceArn); // effective Lambda ARN used for the target

  if (sourceType === "LAMBDA") {
    // Direct Lambda target
    targetConfiguration = {
      mcp: {
        lambda: {
          lambdaArn: lambdaArn,
          toolSchema: { inlinePayload: toolSchema },
        },
      },
    };
    await addLambdaInvokePermission(lambdaArn, gatewayArn, conn);

  } else if (sourceType === "API_GATEWAY") {
    // Deploy a MCP-protocol Lambda wrapper that proxies HTTP calls to the API Gateway,
    // then register the wrapper Lambda as the Gateway target.
    console.log(`[gateway-deployer] API_GATEWAY tool — deploying MCP wrapper Lambda for ${ltd.toolKey}`);
    const wrapper = await ensureWrapperLambda({ ltd, etd, conn, discoveredResources });
    wrapperLambdaArn = wrapper.lambdaArn;
    lambdaArn        = wrapper.lambdaArn;

    targetConfiguration = {
      mcp: {
        lambda: {
          lambdaArn: wrapperLambdaArn,
          toolSchema: { inlinePayload: toolSchema },
        },
      },
    };
    await addLambdaInvokePermission(wrapperLambdaArn, gatewayArn, conn);
    console.log(`[gateway-deployer] Wrapper Lambda registered: ${wrapperLambdaArn}`);

  } else {
    throw new Error(
      `Unsupported sourceType "${sourceType}" for tool "${ltd.toolKey}". ` +
      `Supported types: LAMBDA, API_GATEWAY.`
    );
  }

  // Step 4: Create Gateway Target
  const result = await client.send(new CreateGatewayTargetCommand({
    gatewayIdentifier: gatewayId,
    name: ltd.toolKey.replace(/_/g, "-"),
    description: ltd.description || ltd.displayName || ltd.toolKey,
    credentialProviderConfigurations: [{ credentialProviderType: "GATEWAY_IAM_ROLE" }],
    targetConfiguration,
  }));

  console.log(`[gateway-deployer] Created target ${result.targetId} for ${ltd.toolKey} on gateway ${gatewayId}`);
  return {
    targetId:        result.targetId,
    gatewayId,
    gatewayArn,
    gatewayUrl,
    mcpToolName:     ltd.toolKey,
    status:          result.status,
    wrapperLambdaArn,
  };
}

module.exports = { ensureGateway, deployTool };
