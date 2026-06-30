"use strict";

/**
 * Full async AgentCore deploy pipeline for authored (Strands) agents.
 *
 * Flow:
 *   1. Generate all Strands source files from the agent DB record
 *   2. Bundle into a .zip (AgentCore requires zip, not raw .py)
 *   3. Upload zip to S3 at agents/{agentId}/agent.zip
 *   4. CreateAgentRuntime (codeConfiguration.s3) — poll until READY (~2-3 min)
 *   5. CreateAgentRuntimeEndpoint — poll until READY (~1-2 min)
 *   6. Update agent_environment_deployments with all IDs/ARNs
 *   7. Set agent.status = ACTIVE
 *
 * Called by the deploy route in server.cjs after returning 202.
 * Progress is streamed into the deployment_logs column in real-time.
 */

const path = require("path");
const fs   = require("fs");
const os   = require("os");
const { execSync } = require("child_process");

/**
 * Bundle a map of { filename -> content } into a zip buffer using Python's
 * zipfile module (no extra npm package needed).
 */
function makeZip(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-agent-"));
  try {
    // Write each file (supports sub-paths like "tests/test_agent.py")
    for (const [name, content] of Object.entries(files)) {
      const dest = path.join(tmpDir, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content, "utf8");
    }

    const zipPath = path.join(tmpDir, "agent.zip");

    // Build the python zipfile command — add every file relative to tmpDir
    const entries = Object.keys(files)
      .map((f) => `z.write(r'${path.join(tmpDir, f)}', '${f}')`)
      .join("; ");

    execSync(
      `python3 -c "import zipfile; z=zipfile.ZipFile(r'${zipPath}','w',zipfile.ZIP_DEFLATED); ${entries}; z.close()"`,
      { stdio: "pipe" }
    );

    return fs.readFileSync(zipPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function deployAgentToAgentCore({ db, agent, aedId, now }) {
  const logs = [];

  async function addLog(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(`[agent-deployer] ${msg}`);
    logs.push(line);
    try {
      await db.run(
        "UPDATE agent_environment_deployments SET deployment_logs = ?, updated_at = ? WHERE id = ?",
        [JSON.stringify(logs), now(), aedId]
      );
    } catch (_) {}
  }

  async function fail(err) {
    await addLog(`ERROR: ${err.message}`);
    await db.run(
      "UPDATE agent_environment_deployments SET deployment_status = 'FAILED', error_message = ?, deployment_logs = ?, updated_at = ? WHERE id = ?",
      [err.message, JSON.stringify(logs), now(), aedId]
    );
    // Keep agent.status as APPROVED so the user can retry without re-approval
    await db.run("UPDATE agents SET status = 'APPROVED', updated_at = ? WHERE id = ?", [now(), agent.id]);
  }

  try {
    const { resolveLocalAwsContext } = require("./aws-client.cjs");
    const { uploadAgentCode, createAgentRuntime, waitForRuntimeReady,
            createRuntimeEndpoint, waitForEndpointReady } = require("./agentcore-client.cjs");
    const { generateStrands } = require(path.join(__dirname, "../codegen/strands-generator.cjs"));

    const ctx = await resolveLocalAwsContext();
    if (!ctx) throw new Error("AWS context not resolved — ensure USE_REAL_AWS=true and valid ~/.aws/credentials");

    const { accountId } = ctx;
    const bucket      = `pegasus-agent-artifacts-${accountId}`;
    const roleArn     = `arn:aws:iam::${accountId}:role/AgentCoreExecutionRole`;
    const runtimeName = `guardian_${agent.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const s3Prefix    = `agents/${agent.id}/`;
    const zipKey      = `${s3Prefix}agent.zip`;

    await addLog(`Agent: '${agent.name}' (${agent.id})`);
    await addLog(`Runtime name: ${runtimeName}`);
    await addLog(`Bucket: s3://${bucket}`);
    await addLog(`Role: ${roleArn}`);

    // Step 1: Generate all source files
    const manifest = {
      id:           agent.id,
      name:         agent.name,
      version:      "0.1.0",
      systemPrompt: agent.system_prompt || "You are a helpful AI assistant.",
      model:        { modelId: agent.model_id || "anthropic.claude-haiku-4-5-20251001" },
      tools:        [],
      knowledge:    [],
      memory:       { shortTerm: true, longTerm: false },
    };
    const files = generateStrands(manifest, agent.project_id);
    const fileList = Object.keys(files).join(", ");
    await addLog(`Generated source files: ${fileList}`);

    // Step 2: Bundle into zip
    await addLog(`Bundling ${Object.keys(files).length} files into agent.zip…`);
    const zipBuffer = makeZip(files);
    await addLog(`Bundle size: ${(zipBuffer.length / 1024).toFixed(1)} KB`);

    // Step 3: Upload zip to S3
    await addLog(`Uploading to s3://${bucket}/${zipKey}`);
    await uploadAgentCode(bucket, zipKey, zipBuffer);
    await addLog(`Upload complete.`);

    // Step 4: Create AgentCore Runtime (if name exists, old runtime is deleted first → fresh code)
    await addLog(`Creating AgentCore Runtime '${runtimeName}'… (existing runtime will be replaced if present)`);
    const { agentRuntimeId, agentRuntimeArn } = await createAgentRuntime({
      name:          runtimeName,
      roleArn,
      bucket,
      s3Prefix:      zipKey,
      entryPoint:    ["harness.py"],
      pythonRuntime: "PYTHON_3_12",
      description:   `Guardian AI Platform — ${agent.name}`,
    });
    await addLog(`Runtime created: ${agentRuntimeId}`);

    // Step 5: Wait for READY
    await addLog(`Waiting for runtime to become READY (this takes 2–4 minutes)…`);
    await waitForRuntimeReady(agentRuntimeId, { intervalMs: 8000, maxAttempts: 30 });
    await addLog(`Runtime is READY.`);

    // Step 6: Create endpoint
    const endpointName = `${runtimeName}Ep`;
    await addLog(`Creating endpoint '${endpointName}'…`);
    const { agentRuntimeEndpointId, agentRuntimeEndpointArn } =
      await createRuntimeEndpoint(agentRuntimeId, endpointName);
    await addLog(`Endpoint created: ${agentRuntimeEndpointId}`);

    // Step 7: Wait for endpoint READY — SDK uses endpointName as the stable identifier
    await addLog(`Waiting for endpoint to become READY…`);
    await waitForEndpointReady(agentRuntimeId, endpointName, { intervalMs: 6000, maxAttempts: 20 });
    await addLog(`Endpoint is READY.`);

    const s3CodeLocation = `s3://${bucket}/${zipKey}`;

    // Step 8: Persist
    await db.run(
      `UPDATE agent_environment_deployments SET
         deployment_status      = 'ACTIVE',
         agent_core_agent_id    = ?,
         agent_core_agent_arn   = ?,
         agent_core_endpoint_id = ?,
         runtime_name           = ?,
         s3_code_location       = ?,
         deployment_logs        = ?,
         deployed_at            = ?,
         updated_at             = ?
       WHERE id = ?`,
      [agentRuntimeId, agentRuntimeArn, agentRuntimeEndpointId,
       runtimeName, s3CodeLocation, JSON.stringify(logs), now(), now(), aedId]
    );
    await db.run("UPDATE agents SET status = 'ACTIVE', updated_at = ? WHERE id = ?", [now(), agent.id]);
    await addLog(`Deployment complete — agent is ACTIVE. Invoke via endpoint: ${agentRuntimeEndpointId}`);

    return { agentRuntimeId, agentRuntimeArn, agentRuntimeEndpointId, s3CodeLocation };

  } catch (err) {
    await fail(err);
    throw err;
  }
}

module.exports = { deployAgentToAgentCore };
