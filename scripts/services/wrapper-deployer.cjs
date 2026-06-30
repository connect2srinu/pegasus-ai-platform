"use strict";

/**
 * Wrapper Lambda deployer for API Gateway tools.
 *
 * When an org tool has sourceType = API_GATEWAY, AgentCore Gateway cannot
 * target it directly (Gateway only supports Lambda targets). This module:
 *
 *  1. Packages the MCP-protocol Lambda wrapper (lambda-wrapper/index.js)
 *  2. Creates or updates a Lambda function named guardian-apigw-{toolKey}
 *  3. Configures it with the API Gateway URL + tool metadata as env vars
 *  4. Returns the Lambda ARN so gateway-deployer can register it as a target
 *
 * Prerequisites (one-time, created by platform admin):
 *   IAM role  GuardianWrapperLambdaRole  — trust: lambda.amazonaws.com
 *             Attached policy: AWSLambdaBasicExecutionRole
 *
 * Additional permissions needed on AgentCoreExecutionRole (GuardianGatewayDeploy):
 *   lambda:CreateFunction, lambda:UpdateFunctionCode,
 *   lambda:UpdateFunctionConfiguration, lambda:GetFunction
 */

const { STSClient, AssumeRoleCommand }      = require("@aws-sdk/client-sts");
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
} = require("@aws-sdk/client-lambda");
const { IAMClient, GetRoleCommand }          = require("@aws-sdk/client-iam");
const fs                                     = require("fs");
const path                                   = require("path");

const WRAPPER_SRC_PATH = path.join(__dirname, "lambda-wrapper", "index.js");
const WRAPPER_ROLE_NAME = "GuardianWrapperLambdaRole";

// ── Credentials ───────────────────────────────────────────────────────────────

async function assumeDeploymentRole(conn) {
  const roleArn = conn.deploymentRoleArn || conn.provisioningRoleArn;
  if (!roleArn) throw new Error(`No deploymentRoleArn on connection ${conn.id}`);
  const region = conn.region || "us-east-1";
  const sts = new STSClient({ region });
  const r = await sts.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `guardian-wrapper-${Date.now()}`,
    DurationSeconds: 900,
  }));
  return {
    credentials: {
      accessKeyId:     r.Credentials.AccessKeyId,
      secretAccessKey: r.Credentials.SecretAccessKey,
      sessionToken:    r.Credentials.SessionToken,
    },
    region,
  };
}

// ── Lambda function naming ────────────────────────────────────────────────────

function wrapperFunctionName(ltd) {
  const key = ltd.toolKey.replace(/_/g, "-").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  return `guardian-apigw-${key}`;
}

// ── ZIP packaging (pure Node — no `zip` binary required) ─────────────────────

function createZipBuffer() {
  const source = fs.readFileSync(WRAPPER_SRC_PATH);
  const fileName = "index.js";

  // Build a minimal ZIP file in memory.
  // ZIP format: local file header + data, then central directory, then end-of-central-directory.
  const zlib = require("zlib");

  const deflated   = zlib.deflateRawSync(source, { level: 6 });
  const crc        = crc32(source);
  const now        = new Date();
  const dosTime    = dosDateTime(now);

  const nameBytes  = Buffer.from(fileName, "utf8");
  const nameLen    = nameBytes.length;

  // Local file header (30 bytes + name)
  const localHeader = Buffer.alloc(30 + nameLen);
  localHeader.writeUInt32LE(0x04034b50, 0);  // signature
  localHeader.writeUInt16LE(20,     4);       // version needed
  localHeader.writeUInt16LE(0,      6);       // flags
  localHeader.writeUInt16LE(8,      8);       // deflate
  localHeader.writeUInt32LE(dosTime, 10);     // mod time+date
  localHeader.writeUInt32LE(crc,    14);      // CRC-32
  localHeader.writeUInt32LE(deflated.length, 18); // compressed size
  localHeader.writeUInt32LE(source.length,   22); // uncompressed size
  localHeader.writeUInt16LE(nameLen, 26);    // filename length
  localHeader.writeUInt16LE(0,       28);    // extra field length
  nameBytes.copy(localHeader, 30);

  const localOffset = 0;
  const localEntry  = Buffer.concat([localHeader, deflated]);

  // Central directory record (46 bytes + name)
  const central = Buffer.alloc(46 + nameLen);
  central.writeUInt32LE(0x02014b50, 0);  // signature
  central.writeUInt16LE(20,  4);         // version made by
  central.writeUInt16LE(20,  6);         // version needed
  central.writeUInt16LE(0,   8);         // flags
  central.writeUInt16LE(8,  10);         // deflate
  central.writeUInt32LE(dosTime, 12);    // mod time+date
  central.writeUInt32LE(crc,     16);    // CRC-32
  central.writeUInt32LE(deflated.length, 20); // compressed size
  central.writeUInt32LE(source.length,   24); // uncompressed size
  central.writeUInt16LE(nameLen, 28);   // filename length
  central.writeUInt16LE(0,  30);         // extra field length
  central.writeUInt16LE(0,  32);         // file comment length
  central.writeUInt16LE(0,  34);         // disk number start
  central.writeUInt16LE(0,  36);         // internal attrs
  central.writeUInt32LE(0,  38);         // external attrs
  central.writeUInt32LE(localOffset, 42); // local header offset
  nameBytes.copy(central, 46);

  const centralOffset = localEntry.length;
  const centralSize   = central.length;

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);  // signature
  eocd.writeUInt16LE(0,  4);          // disk number
  eocd.writeUInt16LE(0,  6);          // disk with central dir
  eocd.writeUInt16LE(1,  8);          // entries on disk
  eocd.writeUInt16LE(1, 10);          // total entries
  eocd.writeUInt32LE(centralSize, 12); // central dir size
  eocd.writeUInt32LE(centralOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20);          // comment length

  return Buffer.concat([localEntry, central, eocd]);
}

// CRC-32 used by ZIP
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return ((date << 16) | time) >>> 0;
}

// ── API Gateway URL resolution ────────────────────────────────────────────────

/**
 * Resolve the API Gateway base URL and stage from multiple sources:
 *   1. Explicit etd.apiGatewayUrl
 *   2. ETD / LTD sourceResourceArn  (arn:aws:apigateway:REGION::restapis/API_ID
 *                                    or arn:aws:execute-api:REGION:ACCOUNT:API_ID)
 *   3. Discovered resources — name match against toolKey / displayName
 *
 * Returns { invokeUrl, stage, sourceArn }
 */
function resolveApiGatewayUrl(ltd, etd, conn, discoveredResources) {
  const region = conn.region || "us-east-1";

  // 1. Explicit URL on ETD
  if (etd.apiGatewayUrl) {
    return { invokeUrl: etd.apiGatewayUrl, stage: etd.apiStage || "", sourceArn: etd.sourceResourceArn };
  }

  // 2. Derive from ARN
  const arn = etd.sourceResourceArn || ltd.sourceResourceArn;
  if (arn) {
    const apiId = extractApiIdFromArn(arn);
    if (apiId) {
      return {
        invokeUrl: `https://${apiId}.execute-api.${region}.amazonaws.com`,
        stage:     extractStageFromArn(arn) || "",
        sourceArn: arn,
      };
    }
  }

  // 3. Discovered resources — match by name
  const nameVariants = [
    ltd.toolKey,
    ltd.toolKey.replace(/_/g, "-"),
    (ltd.displayName || "").toLowerCase().replace(/\s+/g, ""),
  ].filter(Boolean);

  const dr = (discoveredResources || []).find((r) => {
    if (r.organizationId !== conn.organizationId) return false;
    if (!["API_GATEWAY_REST", "API_GATEWAY", "AWS::ApiGateway::RestApi"].includes(r.resourceType)) return false;
    const rName = (r.resourceName || "").toLowerCase().replace(/\s+/g, "");
    return nameVariants.some((v) =>
      rName.includes(v.toLowerCase()) || v.toLowerCase().includes(rName)
    );
  });

  if (dr) {
    const drRegion = dr.region || region;
    const meta = dr.metadataJson ? JSON.parse(dr.metadataJson) : {};
    const apiId = dr.resourceId || extractApiIdFromArn(dr.resourceArn);
    return {
      invokeUrl: `https://${apiId}.execute-api.${drRegion}.amazonaws.com`,
      stage:     meta.stageName || "",
      sourceArn: dr.resourceArn,
    };
  }

  throw new Error(
    `Cannot resolve API Gateway URL for "${ltd.toolKey}". ` +
    `Set sourceResourceArn on the ETD (format: arn:aws:apigateway:REGION::restapis/API_ID) ` +
    `or run AWS resource discovery for this org first.`
  );
}

function extractApiIdFromArn(arn) {
  if (!arn) return null;
  // arn:aws:apigateway:REGION::restapis/API_ID
  const m1 = arn.match(/\/restapis\/([a-z0-9]+)/i);
  if (m1) return m1[1];
  // arn:aws:execute-api:REGION:ACCOUNT:API_ID/STAGE/...
  const m2 = arn.match(/execute-api:[^:]+:[^:]*:([a-z0-9]+)/i);
  if (m2) return m2[1];
  return null;
}

function extractStageFromArn(arn) {
  if (!arn) return null;
  // arn:aws:execute-api:REGION:ACCOUNT:API_ID/STAGE/...
  const m = arn.match(/execute-api:[^:]+:[^:]*:[a-z0-9]+\/([^/]+)/i);
  return m ? m[1] : null;
}

// ── Lambda execution role ─────────────────────────────────────────────────────

async function resolveWrapperRole(iam, conn) {
  // Prefer explicitly configured role on connection
  if (conn.wrapperLambdaRoleArn) return conn.wrapperLambdaRoleArn;

  // Look for GuardianWrapperLambdaRole
  try {
    const r = await iam.send(new GetRoleCommand({ RoleName: WRAPPER_ROLE_NAME }));
    return r.Role.Arn;
  } catch (e) {
    if (e.name !== "NoSuchEntityException") throw e;
  }

  throw new Error(
    `IAM role "${WRAPPER_ROLE_NAME}" not found. ` +
    `Create it manually:\n` +
    `  Trust policy: { "Principal": { "Service": "lambda.amazonaws.com" }, "Action": "sts:AssumeRole" }\n` +
    `  Attach managed policy: arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole\n` +
    `Then re-run the deployment.`
  );
}

// ── Lambda deploy / update ────────────────────────────────────────────────────

/**
 * Wait until a Lambda function reaches Active state (after create or code update).
 */
async function waitForLambdaActive(lambda, fnName, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);
    try {
      const r = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fnName }));
      if (r.State === "Active") return;
      if (r.State === "Failed") throw new Error(`Lambda ${fnName} entered Failed state: ${r.StateReasonCode}`);
      console.log(`[wrapper-deployer] Lambda ${fnName} state: ${r.State} (${i + 1}/${maxAttempts})`);
    } catch (e) {
      if (e.name === "ResourceNotFoundException") throw e;
      // transient — retry
    }
  }
  throw new Error(`Lambda ${fnName} did not reach Active state within ${maxAttempts * 5}s`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Deploy (create or update) the wrapper Lambda for the given LTD.
 * Returns the Lambda ARN.
 */
async function ensureWrapperLambda({ ltd, etd, conn, discoveredResources }) {
  const { credentials, region } = await assumeDeploymentRole(conn);
  const lambda = new LambdaClient({ region, credentials });
  const iam    = new IAMClient({ region, credentials });

  const fnName = wrapperFunctionName(ltd);

  // Resolve API Gateway endpoint
  const { invokeUrl, stage, sourceArn } = resolveApiGatewayUrl(ltd, etd, conn, discoveredResources);
  console.log(`[wrapper-deployer] Resolved API GW URL: ${invokeUrl} stage="${stage}"`);

  // Resolve Lambda execution role
  const roleArn = await resolveWrapperRole(iam, conn);
  console.log(`[wrapper-deployer] Using execution role: ${roleArn}`);

  // Build env vars
  const envVars = {
    TOOL_KEY:         ltd.toolKey,
    TOOL_NAME:        ltd.displayName || ltd.toolKey,
    TOOL_DESCRIPTION: ltd.description || ltd.displayName || ltd.toolKey,
    API_GATEWAY_URL:  invokeUrl,
    API_STAGE:        stage,
    DEFAULT_PATH:     "/",
    DEFAULT_METHOD:   "POST",
  };
  if (ltd.inputSchemaJson) envVars.INPUT_SCHEMA_JSON = ltd.inputSchemaJson;

  // Package the wrapper code
  const zipBuffer = createZipBuffer();
  console.log(`[wrapper-deployer] Packaged wrapper (${zipBuffer.byteLength} bytes)`);

  // Check if function already exists
  let functionArn;
  try {
    const existing = await lambda.send(new GetFunctionCommand({ FunctionName: fnName }));
    functionArn = existing.Configuration.FunctionArn;
    console.log(`[wrapper-deployer] Updating existing wrapper Lambda: ${fnName}`);

    // Update code
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: fnName,
      ZipFile:      zipBuffer,
    }));
    await waitForLambdaActive(lambda, fnName);

    // Update config (env vars, description)
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: fnName,
      Description:  `AgentCore MCP wrapper for ${ltd.displayName || ltd.toolKey} (API Gateway proxy)`,
      Environment:  { Variables: envVars },
      Timeout:      30,
    }));
    await waitForLambdaActive(lambda, fnName);
    console.log(`[wrapper-deployer] Wrapper Lambda updated: ${functionArn}`);
  } catch (e) {
    if (e.name !== "ResourceNotFoundException") throw e;

    // Create new function
    console.log(`[wrapper-deployer] Creating wrapper Lambda: ${fnName}`);
    const created = await lambda.send(new CreateFunctionCommand({
      FunctionName:  fnName,
      Runtime:       "nodejs18.x",
      Handler:       "index.handler",
      Role:          roleArn,
      Code:          { ZipFile: zipBuffer },
      Description:   `AgentCore MCP wrapper for ${ltd.displayName || ltd.toolKey} (API Gateway proxy)`,
      Environment:   { Variables: envVars },
      Timeout:       30,
      MemorySize:    128,
    }));
    functionArn = created.FunctionArn;
    console.log(`[wrapper-deployer] Wrapper Lambda created: ${functionArn}`);

    // Wait for Active before registering as Gateway target
    await waitForLambdaActive(lambda, fnName);
  }

  return { lambdaArn: functionArn, invokeUrl, stage, sourceArn };
}

module.exports = { ensureWrapperLambda, wrapperFunctionName };
