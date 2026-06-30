"use strict";

/**
 * Creates sample Lambda functions in AWS for use with the Guardian AI platform.
 * These are the functions shown in mock inventory discovery.
 *
 * Run with your real AWS credentials:
 *   node scripts/setup/create-sample-lambdas.cjs
 *
 * Or with a specific profile:
 *   AWS_PROFILE=my-profile node scripts/setup/create-sample-lambdas.cjs
 */

const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand } = require("@aws-sdk/client-lambda");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { IAMClient, GetRoleCommand } = require("@aws-sdk/client-iam");

const REGION = process.env.AWS_REGION || "us-east-1";

// Minimal Node.js Lambda handler — returns a mock response for each tool
const HANDLER_CODE = `
exports.handler = async (event) => {
  const tool = process.env.TOOL_NAME || "unknown";
  console.log("Guardian tool invoked:", tool, JSON.stringify(event));
  return {
    statusCode: 200,
    body: JSON.stringify({
      tool,
      result: "Mock result from " + tool,
      input: event,
      timestamp: new Date().toISOString(),
    }),
  };
};
`.trim();

// Pack handler into a zip using python3 zipfile (no system zip needed)
function makeZip(code) {
  const { execSync } = require("child_process");
  const fs   = require("fs");
  const os   = require("os");
  const path = require("path");

  const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-lambda-"));
  const indexPath = path.join(tmpDir, "index.js");
  const zipPath   = path.join(tmpDir, "function.zip");

  fs.writeFileSync(indexPath, code);
  execSync(
    `python3 -c "import zipfile,os; z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED); z.write('${indexPath}','index.js'); z.close()"`,
    { stdio: "pipe" }
  );

  const buf = fs.readFileSync(zipPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return buf;
}

const FUNCTIONS = [
  { name: "payment-post-fn",   toolName: "payment_post",   description: "Processes payment transactions" },
  { name: "claims-lookup-fn",  toolName: "claims_lookup",   description: "Looks up insurance claims" },
  { name: "policy-lookup-fn",  toolName: "policy_lookup",   description: "Looks up insurance policies" },
  { name: "member-lookup-fn",  toolName: "member_lookup",   description: "Looks up member records" },
  { name: "benefits-lookup-fn",toolName: "benefits_lookup", description: "Looks up member benefits" },
];

async function main() {
  const sts = new STSClient({ region: REGION });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  console.log(`[setup] Account: ${accountId}  Region: ${REGION}`);

  // Find an execution role for the Lambdas
  const iam = new IAMClient({ region: REGION });
  let roleArn;
  for (const roleName of ["GuardianWrapperLambdaRole", "AgentCoreExecutionRole"]) {
    try {
      const r = await iam.send(new GetRoleCommand({ RoleName: roleName }));
      roleArn = r.Role.Arn;
      console.log(`[setup] Using execution role: ${roleArn}`);
      break;
    } catch (_) {}
  }
  if (!roleArn) {
    console.error("[setup] ERROR: No suitable execution role found. Run create-wrapper-lambda-role.cjs first.");
    process.exit(1);
  }

  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = makeZip(HANDLER_CODE);

  for (const fn of FUNCTIONS) {
    const fnArn = `arn:aws:lambda:${REGION}:${accountId}:function:${fn.name}`;
    try {
      await lambda.send(new GetFunctionCommand({ FunctionName: fn.name }));
      // Already exists — update code
      await lambda.send(new UpdateFunctionCodeCommand({
        FunctionName: fn.name,
        ZipFile: zipBuffer,
      }));
      console.log(`[setup] Updated: ${fnArn}`);
    } catch (e) {
      if (e.name !== "ResourceNotFoundException") throw e;
      // Create
      await lambda.send(new CreateFunctionCommand({
        FunctionName: fn.name,
        Runtime: "nodejs20.x",
        Handler: "index.handler",
        Role: roleArn,
        Description: fn.description,
        Timeout: 30,
        MemorySize: 128,
        Environment: { Variables: { TOOL_NAME: fn.toolName } },
        Code: { ZipFile: zipBuffer },
      }));
      console.log(`[setup] Created: ${fnArn}`);
    }
  }

  console.log("\n[setup] Done. Run Sync Now in the Connected Accounts tab to pick up the real ARNs.");
}

main().catch((e) => { console.error("[setup] Fatal:", e.message); process.exit(1); });
