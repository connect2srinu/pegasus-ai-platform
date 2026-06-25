"use strict";

// Raw-credential pattern — same rule used throughout the platform
const RAW_CRED_PATTERN = /AKIA|BEGIN (RSA|EC|OPENSSH)|password\s*=\s*["'][^"']+["']|token[-_]?value\s*=\s*["'][^"']+["']/i;
const HARDCODED_ACCOUNT_PATTERN = /\b\d{12}\b/;
const RESERVED_ENV_VARS = new Set(["AWS_REGION", "AWS_DEFAULT_REGION", "AWS_EXECUTION_ENV", "LAMBDA_TASK_ROOT", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]);

function result(id, validationType, status, severity, message, details = null) {
  return { id, validationType, status, severity, message, details, checkedAt: new Date().toISOString() };
}

// ── Structure validation ────────────────────────────────────────────────────
function validateStructure(pkg) {
  const results = [];
  let idSeq = 1;

  if (!pkg.entryPoint || !pkg.entryPoint.trim()) {
    results.push(result(`str-${idSeq++}`, "structure", "fail", "blocking", "Entry point file is required (e.g. app.py)."));
  } else {
    results.push(result(`str-${idSeq++}`, "structure", "pass", "info", `Entry point declared: ${pkg.entryPoint}`));
  }

  if (!pkg.entryFunction || !pkg.entryFunction.trim()) {
    results.push(result(`str-${idSeq++}`, "structure", "warn", "warning", "Entry function not specified; will default to 'handler'. Ensure your package exports this function."));
  } else if (pkg.entryFunction !== "handler") {
    results.push(result(`str-${idSeq++}`, "structure", "warn", "warning", `Entry function is '${pkg.entryFunction}'. AgentCore expects 'handler(event, context)'. A wrapper will be generated.`));
  } else {
    results.push(result(`str-${idSeq++}`, "structure", "pass", "info", `Entry function '${pkg.entryFunction}' matches AgentCore convention.`));
  }

  if (!pkg.dependencyFile || !pkg.dependencyFile.trim()) {
    results.push(result(`str-${idSeq++}`, "structure", "fail", "blocking", "Dependency file path is required (requirements.txt or pyproject.toml)."));
  } else {
    results.push(result(`str-${idSeq++}`, "structure", "pass", "info", `Dependency file declared: ${pkg.dependencyFile}`));
  }

  if (!pkg.pythonVersion) {
    results.push(result(`str-${idSeq++}`, "structure", "warn", "warning", "Python version not specified; defaulting to 3.12."));
  } else {
    results.push(result(`str-${idSeq++}`, "structure", "pass", "info", `Python ${pkg.pythonVersion} specified.`));
  }

  const sourceType = pkg.packageSourceType;
  if (!sourceType) {
    results.push(result(`str-${idSeq++}`, "structure", "fail", "blocking", "Package source type is required."));
  } else if (!pkg.packageLocation && sourceType !== "upload") {
    results.push(result(`str-${idSeq++}`, "structure", "fail", "blocking", `Package location is required for source type '${sourceType}'.`));
  } else {
    results.push(result(`str-${idSeq++}`, "structure", "pass", "info", `Package source: ${sourceType}${pkg.packageLocation ? " — " + pkg.packageLocation : " (uploaded)"}.`));
  }

  return results;
}

// ── Dependency validation ───────────────────────────────────────────────────
function validateDependencies(pkg) {
  const results = [];
  let idSeq = 1;
  const declared = pkg.declaredDependencies || [];

  const hasCrewAI  = declared.some((d) => /^crewai[>=<\s]/i.test(d) || d.toLowerCase() === "crewai");
  const hasBoto3   = declared.some((d) => /^boto3[>=<\s]/i.test(d) || d.toLowerCase() === "boto3");
  const hasOpenAI  = declared.some((d) => /^openai[>=<\s]/i.test(d) || d.toLowerCase() === "openai");

  if (!declared.length) {
    results.push(result(`dep-${idSeq++}`, "dependency", "warn", "warning", "No dependencies declared. Add at minimum: crewai, boto3."));
  } else {
    results.push(result(`dep-${idSeq++}`, "dependency", "pass", "info", `${declared.length} dependenc${declared.length === 1 ? "y" : "ies"} declared.`));
  }

  if (!hasCrewAI) {
    results.push(result(`dep-${idSeq++}`, "dependency", "fail", "blocking", "Missing required dependency: crewai. Add 'crewai>=0.60.0' to your dependency file."));
  } else {
    results.push(result(`dep-${idSeq++}`, "dependency", "pass", "info", "crewai dependency found."));
  }

  if (!hasBoto3) {
    results.push(result(`dep-${idSeq++}`, "dependency", "warn", "warning", "boto3 not declared. Required for Bedrock model invocation via AgentCore."));
  } else {
    results.push(result(`dep-${idSeq++}`, "dependency", "pass", "info", "boto3 dependency found."));
  }

  if (hasOpenAI) {
    results.push(result(`dep-${idSeq++}`, "dependency", "warn", "warning", "openai package detected. Direct OpenAI API calls bypass the approved model gateway. Verify model calls use Bedrock via the approved cross-account role."));
  }

  const flaggedPackages = ["requests", "httpx", "aiohttp"].filter((p) =>
    declared.some((d) => new RegExp(`^${p}[>=<\\s]`, "i").test(d) || d.toLowerCase() === p)
  );
  if (flaggedPackages.length) {
    results.push(result(`dep-${idSeq++}`, "dependency", "warn", "warning", `HTTP client packages detected: ${flaggedPackages.join(", ")}. Ensure external network calls are declared as approved tools in the project catalog.`));
  }

  return results;
}

// ── Security validation ─────────────────────────────────────────────────────
function validateSecurity(pkg) {
  const results = [];
  let idSeq = 1;

  // Check secret refs for raw credentials
  const secretRefs = pkg.secretRefs || [];
  const badSecrets = secretRefs.filter((s) => RAW_CRED_PATTERN.test(s.value || s.name || s));
  if (badSecrets.length) {
    results.push(result(`sec-${idSeq++}`, "security", "fail", "blocking",
      `Raw credential pattern detected in secret reference(s): ${badSecrets.map((s) => s.name || s).join(", ")}. Use secret manager names only (e.g. sm/my-api-key).`,
      { offending: badSecrets.map((s) => s.name || s) }
    ));
  } else if (secretRefs.length) {
    results.push(result(`sec-${idSeq++}`, "security", "pass", "info", `${secretRefs.length} secret reference(s) declared. No raw credential patterns detected.`));
  }

  // Check env vars for hardcoded accounts / reserved names
  const envVars = pkg.envVars || [];
  const reservedUsed = envVars.filter((e) => RESERVED_ENV_VARS.has(e.key));
  if (reservedUsed.length) {
    results.push(result(`sec-${idSeq++}`, "security", "warn", "warning",
      `Reserved AgentCore environment variables declared: ${reservedUsed.map((e) => e.key).join(", ")}. These are injected by the runtime and must not be set in the package.`,
      { reserved: reservedUsed.map((e) => e.key) }
    ));
  }

  const hardcodedAccountVars = envVars.filter((e) => HARDCODED_ACCOUNT_PATTERN.test(e.value || ""));
  if (hardcodedAccountVars.length) {
    results.push(result(`sec-${idSeq++}`, "security", "fail", "blocking",
      `Hardcoded AWS account ID pattern detected in environment variable value(s): ${hardcodedAccountVars.map((e) => e.key).join(", ")}. Use org-level account mappings instead.`,
      { vars: hardcodedAccountVars.map((e) => e.key) }
    ));
  } else {
    results.push(result(`sec-${idSeq++}`, "security", "pass", "info", "No hardcoded AWS account IDs detected in environment variables."));
  }

  // Check runtime command for shell injection patterns
  const cmd = pkg.runtimeCommand || "";
  if (cmd && /[;&|`$(){}]/.test(cmd)) {
    results.push(result(`sec-${idSeq++}`, "security", "warn", "warning",
      `Runtime command contains shell metacharacters: '${cmd}'. Verify this is intentional and not a shell injection risk.`
    ));
  }

  if (!badSecrets.length && !hardcodedAccountVars.length) {
    results.push(result(`sec-${idSeq++}`, "security", "pass", "info", "Security scan completed — no blocking findings."));
  }

  return results;
}

// ── Governance validation ───────────────────────────────────────────────────
function validateGovernance(pkg, projectCatalog, orgConfig) {
  const results = [];
  let idSeq = 1;
  const pid = pkg.projectId;

  // Project allows crewai
  const catalog = projectCatalog[pid];
  if (!catalog) {
    results.push(result(`gov-${idSeq++}`, "governance", "warn", "warning",
      `Project '${pid}' not found in platform catalog. Package will be registered but tool/model validation is limited.`
    ));
  } else if (!catalog.allowedAgentTypes.includes("crewai")) {
    results.push(result(`gov-${idSeq++}`, "governance", "fail", "blocking",
      `Project '${pid}' does not permit CrewAI agents. Allowed types: ${catalog.allowedAgentTypes.join(", ")}.`
    ));
  } else {
    results.push(result(`gov-${idSeq++}`, "governance", "pass", "info", `Project '${pid}' permits CrewAI agents.`));
  }

  // Tool mapping — each declared tool must be in the project's approved catalog
  const declaredTools = pkg.toolIds || [];
  if (declaredTools.length && catalog) {
    const unapproved = declaredTools.filter((t) => !Object.keys(catalog.tools || {}).includes(t));
    if (unapproved.length) {
      results.push(result(`gov-${idSeq++}`, "governance", "fail", "blocking",
        `Tool(s) not approved for project '${pid}': ${unapproved.join(", ")}. Register and approve these tools in the project tool catalog first.`,
        { unapproved }
      ));
    } else {
      results.push(result(`gov-${idSeq++}`, "governance", "pass", "info", `All ${declaredTools.length} declared tool(s) are approved in the project catalog.`));
    }
  } else if (!declaredTools.length) {
    results.push(result(`gov-${idSeq++}`, "governance", "pass", "info", "No tools declared. Package will run without tool access."));
  }

  // Model mapping — model must be in org's allowedModelIds
  const modelId = pkg.modelId;
  if (modelId) {
    const allowedModels = orgConfig?.modelAccount?.allowedModelIds || [];
    if (allowedModels.length && !allowedModels.includes(modelId)) {
      results.push(result(`gov-${idSeq++}`, "governance", "fail", "blocking",
        `Model '${modelId}' is not in the organization's approved model list. Allowed: ${allowedModels.join(", ")}.`,
        { model: modelId, allowed: allowedModels }
      ));
    } else {
      results.push(result(`gov-${idSeq++}`, "governance", "pass", "info", `Model '${modelId}' is approved for this organization.`));
    }
  } else {
    results.push(result(`gov-${idSeq++}`, "governance", "warn", "warning", "No model specified. A default model from the organization's approved list will be used at deployment time."));
  }

  // Org AWS config must be present for deployment
  if (!orgConfig?.executionAccount?.accountId || !orgConfig?.modelAccount?.accountId) {
    results.push(result(`gov-${idSeq++}`, "governance", "warn", "warning",
      "Organization AWS accounts are not fully configured. Deployment will be blocked until a Platform Admin completes AWS account setup."
    ));
  } else {
    results.push(result(`gov-${idSeq++}`, "governance", "pass", "info",
      `Deployment target: execution account ${orgConfig.executionAccount.accountId}, model account ${orgConfig.modelAccount.accountId}.`
    ));
  }

  return results;
}

// ── AgentCore readiness validation ──────────────────────────────────────────
function validateAgentCoreReadiness(pkg) {
  const results = [];
  let idSeq = 1;

  const entryFn = pkg.entryFunction || "";
  if (!entryFn || entryFn !== "handler") {
    results.push(result(`ac-${idSeq++}`, "agentcore", "warn", "warning",
      `Entry function '${entryFn || "(none)"}' does not match AgentCore convention 'handler(event, context)'. A wrapper (agentcore_wrapper.py) will be auto-generated to adapt your entry point.`
    ));
  } else {
    results.push(result(`ac-${idSeq++}`, "agentcore", "pass", "info", "Entry function signature is AgentCore-compatible."));
  }

  if (!pkg.inputSchema) {
    results.push(result(`ac-${idSeq++}`, "agentcore", "warn", "warning", "No input schema declared. Documenting the expected payload schema is recommended for downstream integrations."));
  } else {
    results.push(result(`ac-${idSeq++}`, "agentcore", "pass", "info", "Input schema declared."));
  }

  if (!pkg.outputSchema) {
    results.push(result(`ac-${idSeq++}`, "agentcore", "warn", "warning", "No output schema declared. Response normalization will use a passthrough wrapper."));
  } else {
    results.push(result(`ac-${idSeq++}`, "agentcore", "pass", "info", "Output schema declared."));
  }

  results.push(result(`ac-${idSeq++}`, "agentcore", "pass", "info", "Package is eligible for AgentCore deployment. Wrapper generation will proceed after validation."));

  return results;
}

// ── Main export ─────────────────────────────────────────────────────────────
function validateCrewAIPackage(pkg, projectCatalog, orgConfig) {
  const allResults = [
    ...validateStructure(pkg),
    ...validateDependencies(pkg),
    ...validateSecurity(pkg),
    ...validateGovernance(pkg, projectCatalog, orgConfig),
    ...validateAgentCoreReadiness(pkg),
  ];

  const hasBlocking = allResults.some((r) => r.severity === "blocking" && r.status === "fail");
  const hasWarnings = allResults.some((r) => r.severity === "warning");
  const validationStatus = hasBlocking ? "failed" : hasWarnings ? "passed_with_warnings" : "passed";

  return { validationResults: allResults, validationStatus };
}

module.exports = { validateCrewAIPackage };
