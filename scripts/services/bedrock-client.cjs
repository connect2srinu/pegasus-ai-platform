"use strict";

/**
 * Bedrock service client for local single-account testing mode.
 *
 * Calls real AWS Bedrock APIs using credentials from the default provider chain.
 * Only used when LOCAL_AWS_MODE=true.
 */

const { BedrockClient, ListFoundationModelsCommand } = require("@aws-sdk/client-bedrock");
const { fromNodeProviderChain } = require("@aws-sdk/credential-providers");
const { getLocalAwsContext } = require("./aws-client.cjs");

// Cache model list for the process lifetime (models don't change between calls)
let _modelCache = null;

/**
 * List foundation models available in the account/region.
 * Filters to text-generation models that support on-demand inference.
 *
 * Returns array of:
 *   { modelId, modelName, providerName, inputModalities, outputModalities, inferenceTypesSupported }
 */
async function listAvailableModels() {
  if (_modelCache) return _modelCache;

  const ctx = getLocalAwsContext();
  if (!ctx) throw new Error("Local AWS context not available.");

  try {
    const client = new BedrockClient({
      region: ctx.region,
      credentials: fromNodeProviderChain(),
    });

    const response = await client.send(new ListFoundationModelsCommand({
      byOutputModality: "TEXT",
      byInferenceType: "ON_DEMAND",
    }));

    const models = (response.modelSummaries || []).map((m) => ({
      modelId: m.modelId,
      modelName: m.modelName,
      providerName: m.providerName,
      inputModalities: m.inputModalities || [],
      outputModalities: m.outputModalities || [],
      inferenceTypesSupported: m.inferenceTypesSupported || [],
      // Mark well-known Claude models for priority display
      isRecommended: (m.modelId || "").startsWith("anthropic.claude"),
    }));

    // Sort: recommended (Claude) first, then alphabetical by provider+name
    models.sort((a, b) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      return `${a.providerName}/${a.modelName}`.localeCompare(`${b.providerName}/${b.modelName}`);
    });

    _modelCache = models;
    console.log(`[bedrock-client] ${models.length} foundation models available in ${ctx.region}.`);
    return models;
  } catch (err) {
    // Common causes: Bedrock not enabled in region, insufficient IAM permissions
    console.error(`[bedrock-client] Could not list foundation models: ${err.message}`);
    if (err.name === "AccessDeniedException") {
      console.error("[bedrock-client] IAM policy missing: bedrock:ListFoundationModels");
    }
    return [];
  }
}

/**
 * Returns just the model IDs, suitable for storing in org awsConfig.modelAccount.allowedModelIds.
 */
async function listAvailableModelIds() {
  const models = await listAvailableModels();
  return models.map((m) => m.modelId);
}

/**
 * Check whether a specific model ID is accessible in the account.
 */
async function isModelAvailable(modelId) {
  const ids = await listAvailableModelIds();
  return ids.includes(modelId);
}

/**
 * Invalidate the model cache (call after account config changes).
 */
function clearModelCache() {
  _modelCache = null;
}

module.exports = {
  listAvailableModels,
  listAvailableModelIds,
  isModelAvailable,
  clearModelCache,
};
