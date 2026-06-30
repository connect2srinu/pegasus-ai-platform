"use strict";

/**
 * One-time setup script: creates the GuardianWrapperLambdaRole IAM role used
 * by wrapper-deployer.cjs to deploy MCP wrapper Lambdas for API_GATEWAY tools.
 *
 * Run this with your own admin AWS credentials (NOT the platform's deployment
 * role — granting iam:CreateRole to AgentCoreExecutionRole would let the
 * platform self-escalate, which we deliberately avoid). Use whatever AWS CLI
 * profile/credentials you normally use to administer this account:
 *
 *   AWS_PROFILE=myadmin node scripts/setup/create-wrapper-lambda-role.cjs
 *   AWS_REGION=us-east-1 node scripts/setup/create-wrapper-lambda-role.cjs
 *
 * Idempotent — safe to re-run.
 */

const { IAMClient, CreateRoleCommand, GetRoleCommand, AttachRolePolicyCommand } =
  require("@aws-sdk/client-iam");

const ROLE_NAME = "GuardianWrapperLambdaRole";
const MANAGED_POLICY_ARN = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";

const TRUST_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  }],
});

async function main() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  const iam = new IAMClient({ region });

  let roleArn;
  try {
    const existing = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
    roleArn = existing.Role.Arn;
    console.log(`Role already exists: ${roleArn}`);
  } catch (e) {
    if (e.name !== "NoSuchEntityException") throw e;
    console.log(`Creating role ${ROLE_NAME}...`);
    const created = await iam.send(new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: TRUST_POLICY,
      Description: "Execution role for Guardian platform MCP wrapper Lambdas (API Gateway proxy targets)",
    }));
    roleArn = created.Role.Arn;
    console.log(`Created role: ${roleArn}`);
  }

  console.log(`Attaching managed policy ${MANAGED_POLICY_ARN}...`);
  await iam.send(new AttachRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyArn: MANAGED_POLICY_ARN,
  }));
  console.log("Policy attached (or already attached).");

  console.log(`\nDone. ${ROLE_NAME} is ready: ${roleArn}`);
  console.log("IAM role propagation can take ~10-15s before Lambda can assume it.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
