"use strict";

/**
 * AWS inventory scanner.
 *
 * When LOCAL_AWS_MODE=true, calls real AWS APIs (Lambda, API Gateway, Bedrock AgentCore)
 * using the credential provider chain.  Falls back to mock data in demo/CI mode.
 */

const { isLocalAwsMode, getLocalAwsContext } = require("./aws-client.cjs");
const { fromNodeProviderChain } = require("@aws-sdk/credential-providers");

function nowIso() { return new Date().toISOString(); }

// ── Real AWS scanners ─────────────────────────────────────────────────────────

async function realScanLambda(region, connectionId, orgId, accountId) {
  const { LambdaClient, ListFunctionsCommand } = require("@aws-sdk/client-lambda");
  const client = new LambdaClient({ region, credentials: fromNodeProviderChain() });
  const resources = [];
  let marker;
  do {
    const resp = await client.send(new ListFunctionsCommand({ Marker: marker, MaxItems: 50 }));
    for (const fn of resp.Functions || []) {
      resources.push(decorateResource({
        resourceType: "LAMBDA",
        resourceArn: fn.FunctionArn,
        resourceId: fn.FunctionName,
        resourceName: fn.FunctionName,
        parentResourceId: null,
        metadataJson: JSON.stringify({
          runtime: fn.Runtime,
          handler: fn.Handler,
          timeout: fn.Timeout,
          memorySize: fn.MemorySize,
          lastModified: fn.LastModified,
          description: fn.Description || "",
          environment: fn.Environment?.Variables || {},
        }),
        tagsJson: JSON.stringify({}),
      }, accountId, region, connectionId, orgId, `lambda-${fn.FunctionName}`));
    }
    marker = resp.NextMarker;
  } while (marker);
  return resources;
}

async function realScanApiGatewayRest(region, connectionId, orgId, accountId) {
  const { APIGatewayClient, GetRestApisCommand, GetStagesCommand } = require("@aws-sdk/client-api-gateway");
  const client = new APIGatewayClient({ region, credentials: fromNodeProviderChain() });
  const resources = [];
  let position;
  do {
    const resp = await client.send(new GetRestApisCommand({ position, limit: 25 }));
    for (const api of resp.items || []) {
      let stages = [];
      try {
        const stagesResp = await client.send(new GetStagesCommand({ restApiId: api.id }));
        stages = (stagesResp.item || []).map((s) => s.stageName);
      } catch { /* no stages */ }
      resources.push(decorateResource({
        resourceType: "API_GATEWAY_REST",
        resourceArn: `arn:aws:apigateway:${region}::/restapis/${api.id}`,
        resourceId: api.id,
        resourceName: api.name,
        parentResourceId: null,
        metadataJson: JSON.stringify({
          description: api.description || "",
          stageName: stages[0] || null,
          stages,
          endpointType: api.endpointConfiguration?.types?.[0] || "REGIONAL",
          createdDate: api.createdDate,
        }),
        tagsJson: JSON.stringify(api.tags || {}),
      }, accountId, region, connectionId, orgId, `apigw-${api.id}`));
    }
    position = resp.position;
  } while (position);
  return resources;
}

async function realScanAgentCoreGateways(region, connectionId, orgId, accountId) {
  // BedrockAgentCoreControl SDK — list gateways and their targets
  let BedrockAgentCoreControlClient, ListAgentGatewaysCommand, ListAgentGatewayTargetsCommand;
  try {
    const mod = require("@aws-sdk/client-bedrock-agentcore-control");
    BedrockAgentCoreControlClient = mod.BedrockAgentCoreControlClient;
    ListAgentGatewaysCommand = mod.ListAgentGatewaysCommand;
    ListAgentGatewayTargetsCommand = mod.ListAgentGatewayTargetsCommand;
    if (!ListAgentGatewaysCommand) return []; // command not in this SDK version
  } catch {
    return []; // SDK not available
  }
  const client = new BedrockAgentCoreControlClient({ region, credentials: fromNodeProviderChain() });
  const resources = [];
  let nextToken;
  try {
    do {
      const resp = await client.send(new ListAgentGatewaysCommand({ nextToken, maxResults: 20 }));
      for (const gw of resp.agentGateways || []) {
        const gwArn = gw.agentGatewayArn || `arn:aws:bedrock-agentcore:${region}:${accountId}:gateway/${gw.agentGatewayId}`;
        resources.push(decorateResource({
          resourceType: "AGENTCORE_GATEWAY",
          resourceArn: gwArn,
          resourceId: gw.agentGatewayId,
          resourceName: gw.agentGatewayName,
          parentResourceId: null,
          metadataJson: JSON.stringify({
            status: gw.status || gw.agentGatewayStatus,
            gatewayUrl: gw.gatewayUrl,
            createdAt: gw.createdAt,
          }),
          tagsJson: JSON.stringify(gw.tags || {}),
        }, accountId, region, connectionId, orgId, `acgw-${gw.agentGatewayId}`));

        // Fetch targets for this gateway
        try {
          let tNextToken;
          do {
            const tResp = await client.send(new ListAgentGatewayTargetsCommand({
              agentGatewayId: gw.agentGatewayId, nextToken: tNextToken, maxResults: 20,
            }));
            for (const tgt of tResp.agentGatewayTargets || []) {
              resources.push(decorateResource({
                resourceType: "AGENTCORE_GATEWAY_TARGET",
                resourceArn: `${gwArn}/target/${tgt.agentGatewayTargetId}`,
                resourceId: tgt.agentGatewayTargetId,
                resourceName: tgt.targetName || tgt.agentGatewayTargetId,
                parentResourceId: gw.agentGatewayId,
                metadataJson: JSON.stringify({
                  targetType: tgt.targetType,
                  lambdaArn: tgt.lambdaFunctionTarget?.lambdaFunctionArn,
                  status: tgt.status,
                }),
                tagsJson: "{}",
              }, accountId, region, connectionId, orgId, `acgwtgt-${tgt.agentGatewayTargetId}`));
            }
            tNextToken = tResp.nextToken;
          } while (tNextToken);
        } catch { /* targets not accessible */ }
      }
      nextToken = resp.nextToken;
    } while (nextToken);
  } catch (e) {
    // API not available in this region/account — return empty
    if (e.name !== "AccessDeniedException") console.warn(`[inventory] AgentCore gateway scan skipped: ${e.message}`);
  }
  return resources;
}

// ── Mock scanners (demo / CI mode) ───────────────────────────────────────────

function mockArn(service, region, accountId, resourceType, resourceId) {
  return `arn:aws:${service}:${region}:${accountId}:${resourceType}/${resourceId}`;
}

function mockScanApiGatewayRest(accountId, region, connectionId, orgId) {
  return [
    { resourceType:"API_GATEWAY_REST", resourceArn: mockArn("apigateway",region,accountId,"restapi","abc1def234"), resourceId:"abc1def234", resourceName:"ClaimsProcessingAPI", parentResourceId:null,
      metadataJson:JSON.stringify({stageName:"prod",methods:["GET /claims/{id}","POST /claims"],authorizationType:"AWS_IAM",endpointType:"REGIONAL"}),
      tagsJson:JSON.stringify({BU:"Claims",Environment:"prod"}) },
    { resourceType:"API_GATEWAY_REST", resourceArn: mockArn("apigateway",region,accountId,"restapi","xyz9uvw876"), resourceId:"xyz9uvw876", resourceName:"MemberServicesAPI", parentResourceId:null,
      metadataJson:JSON.stringify({stageName:"prod",methods:["GET /members/{id}","GET /members/{id}/benefits"],authorizationType:"AWS_IAM",endpointType:"REGIONAL"}),
      tagsJson:JSON.stringify({BU:"MemberServices",Environment:"prod"}) },
    { resourceType:"API_GATEWAY_REST", resourceArn: mockArn("apigateway",region,accountId,"restapi","pay3ment901"), resourceId:"pay3ment901", resourceName:"BillingPaymentsAPI", parentResourceId:null,
      metadataJson:JSON.stringify({stageName:"prod",methods:["GET /invoices/{id}","POST /invoices/{id}/pay"],authorizationType:"AWS_IAM",endpointType:"REGIONAL"}),
      tagsJson:JSON.stringify({BU:"Billing",Environment:"prod"}) },
  ].map((r,i) => decorateResource(r,accountId,region,connectionId,orgId,i));
}

function mockScanLambda(accountId, region, connectionId, orgId) {
  return [
    { resourceType:"LAMBDA", resourceArn:mockArn("lambda",region,accountId,"function","claims-lookup-fn"), resourceId:"claims-lookup-fn", resourceName:"claims-lookup-fn", parentResourceId:null,
      metadataJson:JSON.stringify({runtime:"python3.12",handler:"handler.lambda_handler",timeout:30,memorySize:512,description:"Look up claim details by claim ID."}), tagsJson:"{}" },
    { resourceType:"LAMBDA", resourceArn:mockArn("lambda",region,accountId,"function","policy-lookup-fn"), resourceId:"policy-lookup-fn", resourceName:"policy-lookup-fn", parentResourceId:null,
      metadataJson:JSON.stringify({runtime:"python3.12",handler:"handler.lambda_handler",timeout:15,memorySize:256,description:"Retrieve insurance policy details."}), tagsJson:"{}" },
    { resourceType:"LAMBDA", resourceArn:mockArn("lambda",region,accountId,"function","member-lookup-fn"), resourceId:"member-lookup-fn", resourceName:"member-lookup-fn", parentResourceId:null,
      metadataJson:JSON.stringify({runtime:"python3.12",handler:"handler.lambda_handler",timeout:10,memorySize:256,description:"Look up member profile and plan details."}), tagsJson:"{}" },
    { resourceType:"LAMBDA", resourceArn:mockArn("lambda",region,accountId,"function","payment-post-fn"), resourceId:"payment-post-fn", resourceName:"payment-post-fn", parentResourceId:null,
      metadataJson:JSON.stringify({runtime:"python3.12",handler:"handler.lambda_handler",timeout:60,memorySize:512,description:"Post a payment transaction. WRITE operation."}), tagsJson:"{}" },
    { resourceType:"LAMBDA", resourceArn:mockArn("lambda",region,accountId,"function","benefits-lookup-fn"), resourceId:"benefits-lookup-fn", resourceName:"benefits-lookup-fn", parentResourceId:null,
      metadataJson:JSON.stringify({runtime:"python3.12",handler:"handler.lambda_handler",timeout:10,memorySize:256,description:"Look up benefits eligibility."}), tagsJson:"{}" },
  ].map((r,i) => decorateResource(r,accountId,region,connectionId,orgId,i+10));
}

function mockScanAgentCoreGateway(accountId, region, connectionId, orgId) {
  const gatewayId="gw-acme-health-prod-001";
  const gwArn=mockArn("bedrock-agentcore",region,accountId,"gateway",gatewayId);
  const gateway = decorateResource({resourceType:"AGENTCORE_GATEWAY",resourceArn:gwArn,resourceId:gatewayId,resourceName:"AcmeHealthAgentCoreGateway",parentResourceId:null,
    metadataJson:JSON.stringify({gatewayUrl:`https://${gatewayId}.gateway.bedrock-agentcore.${region}.amazonaws.com/mcp`,status:"ACTIVE",createdAt:"2025-02-01T08:00:00Z"}),
    tagsJson:JSON.stringify({Org:"AcmeHealth",Environment:"prod"})}, accountId, region, connectionId, orgId, 20);
  const targets=[
    {resourceType:"AGENTCORE_GATEWAY_TARGET",resourceArn:`${gwArn}/target/tgt-claims-lookup`,resourceId:"tgt-claims-lookup",resourceName:"ClaimsLookupTarget",parentResourceId:gatewayId,
      metadataJson:JSON.stringify({targetType:"LAMBDA",lambdaArn:mockArn("lambda",region,accountId,"function","claims-lookup-fn"),mcpToolName:"claim_lookup",status:"ACTIVE"}),tagsJson:"{}"},
    {resourceType:"AGENTCORE_GATEWAY_TARGET",resourceArn:`${gwArn}/target/tgt-policy-lookup`,resourceId:"tgt-policy-lookup",resourceName:"PolicyLookupTarget",parentResourceId:gatewayId,
      metadataJson:JSON.stringify({targetType:"LAMBDA",lambdaArn:mockArn("lambda",region,accountId,"function","policy-lookup-fn"),mcpToolName:"policy_lookup",status:"ACTIVE"}),tagsJson:"{}"},
    {resourceType:"AGENTCORE_GATEWAY_TARGET",resourceArn:`${gwArn}/target/tgt-member-lookup`,resourceId:"tgt-member-lookup",resourceName:"MemberLookupTarget",parentResourceId:gatewayId,
      metadataJson:JSON.stringify({targetType:"LAMBDA",lambdaArn:mockArn("lambda",region,accountId,"function","member-lookup-fn"),mcpToolName:"member_lookup",status:"ACTIVE"}),tagsJson:"{}"},
  ].map((r,i) => decorateResource(r,accountId,region,connectionId,orgId,21+i));
  return [gateway, ...targets];
}

function mockScanBedrockKnowledgeBases(accountId, region, connectionId, orgId) {
  return [
    {resourceType:"BEDROCK_KB",resourceArn:mockArn("bedrock",region,accountId,"knowledge-base","CLMSPOL001"),resourceId:"CLMSPOL001",resourceName:"ClaimsPolicyKnowledgeBase",parentResourceId:null,
      metadataJson:JSON.stringify({status:"ACTIVE",storageType:"OPENSEARCH_SERVERLESS",description:"Insurance policy terms and claims adjudication guidelines."}),tagsJson:JSON.stringify({BU:"Claims"})},
    {resourceType:"BEDROCK_KB",resourceArn:mockArn("bedrock",region,accountId,"knowledge-base","MEMBEN002"),resourceId:"MEMBEN002",resourceName:"MemberBenefitsKnowledgeBase",parentResourceId:null,
      metadataJson:JSON.stringify({status:"ACTIVE",storageType:"OPENSEARCH_SERVERLESS",description:"Member benefits guides, plan summaries, and formularies."}),tagsJson:JSON.stringify({BU:"MemberServices"})},
    {resourceType:"BEDROCK_KB",resourceArn:mockArn("bedrock",region,accountId,"knowledge-base","BILLING003"),resourceId:"BILLING003",resourceName:"BillingFAQKnowledgeBase",parentResourceId:null,
      metadataJson:JSON.stringify({status:"ACTIVE",storageType:"OPENSEARCH_SERVERLESS",description:"Billing FAQs, payment terms, and refund policies."}),tagsJson:JSON.stringify({BU:"Billing"})},
  ].map((r,i) => decorateResource(r,accountId,region,connectionId,orgId,30+i));
}

// ── Shared decorator ──────────────────────────────────────────────────────────

function decorateResource(resource, accountId, region, connectionId, orgId, seqKey) {
  const ts = nowIso();
  const checksumInput = `${resource.resourceArn}:${resource.metadataJson}`;
  const checksum = `sha256:${Buffer.from(checksumInput).toString("hex").slice(0, 40)}`;
  const safeKey = String(seqKey).replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  return {
    id: `dr-${accountId}-${safeKey}-${region.replace(/-/g, "")}`,
    organizationId: orgId,
    awsAccountConnectionId: connectionId,
    awsAccountId: accountId,
    region,
    resourceType: resource.resourceType,
    resourceArn: resource.resourceArn,
    resourceId: resource.resourceId,
    resourceName: resource.resourceName,
    parentResourceId: resource.parentResourceId || null,
    discoveryStatus: "ACTIVE",
    metadataJson: resource.metadataJson,
    tagsJson: resource.tagsJson || "{}",
    checksum,
    lastSeenAt: ts,
    createdAt: ts,
    updatedAt: ts,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run a full inventory scan for a connected AWS account.
 * In LOCAL_AWS_MODE uses real AWS APIs; otherwise returns mock data.
 * Returns { syncRun, resources } — caller persists to registry.
 */
async function runInventorySync(connection, orgId) {
  const runId = `sync-${connection.id}-${Date.now()}`;
  const startedAt = nowIso();
  const discovered = [];
  const errors = [];
  const useRealAws = isLocalAwsMode();

  for (const region of (connection.enabledRegions || ["us-east-1"])) {
    const acctId = connection.awsAccountId;
    if (useRealAws) {
      console.log(`[inventory] Real AWS scan: account=${acctId} region=${region}`);
      try { discovered.push(...(await realScanLambda(region, connection.id, orgId, acctId))); }
      catch (e) { errors.push(`Lambda: ${e.message}`); console.warn(`[inventory] Lambda scan error: ${e.message}`); }
      try { discovered.push(...(await realScanApiGatewayRest(region, connection.id, orgId, acctId))); }
      catch (e) { errors.push(`API Gateway: ${e.message}`); console.warn(`[inventory] API GW scan error: ${e.message}`); }
      try { discovered.push(...(await realScanAgentCoreGateways(region, connection.id, orgId, acctId))); }
      catch (e) { errors.push(`AgentCore Gateway: ${e.message}`); console.warn(`[inventory] AgentCore scan error: ${e.message}`); }
      // KBs are expensive to maintain — keep mock data for them
      try { discovered.push(...mockScanBedrockKnowledgeBases(acctId, region, connection.id, orgId)); } catch { /* */ }
    } else {
      try { discovered.push(...mockScanApiGatewayRest(acctId, region, connection.id, orgId)); } catch { /* */ }
      try { discovered.push(...mockScanLambda(acctId, region, connection.id, orgId)); } catch { /* */ }
      try { discovered.push(...mockScanAgentCoreGateway(acctId, region, connection.id, orgId)); } catch { /* */ }
      try { discovered.push(...mockScanBedrockKnowledgeBases(acctId, region, connection.id, orgId)); } catch { /* */ }
    }
  }

  const completedAt = nowIso();
  const syncRun = {
    id: runId,
    organizationId: orgId,
    awsAccountConnectionId: connection.id,
    syncType: connection._firstSync ? "INITIAL" : "MANUAL",
    regions: connection.enabledRegions || ["us-east-1"],
    status: errors.length === 0 ? "SUCCEEDED" : discovered.length > 0 ? "PARTIAL" : "FAILED",
    startedAt,
    completedAt,
    errorSummary: errors.length ? errors.join("; ") : null,
    resourcesDiscovered: discovered.length,
    resourcesUpdated: 0,
    resourcesRemoved: 0,
  };

  if (useRealAws) {
    console.log(`[inventory] Scan complete: ${discovered.length} resources, ${errors.length} errors.`);
  }

  return { syncRun, resources: discovered };
}

/**
 * Synchronous mock scan — used only for initial registry seeding at startup.
 * Does NOT call AWS. Use runInventorySync for real data.
 */
function runMockInventorySync(connection, orgId) {
  const runId = `sync-${connection.id}-${Date.now()}`;
  const startedAt = nowIso();
  const acctId = connection.awsAccountId;
  const discovered = [];
  for (const region of (connection.enabledRegions || ["us-east-1"])) {
    try { discovered.push(...mockScanApiGatewayRest(acctId, region, connection.id, orgId)); } catch { /* */ }
    try { discovered.push(...mockScanLambda(acctId, region, connection.id, orgId)); } catch { /* */ }
    try { discovered.push(...mockScanAgentCoreGateway(acctId, region, connection.id, orgId)); } catch { /* */ }
    try { discovered.push(...mockScanBedrockKnowledgeBases(acctId, region, connection.id, orgId)); } catch { /* */ }
  }
  const completedAt = nowIso();
  return {
    syncRun: { id: runId, organizationId: orgId, awsAccountConnectionId: connection.id, syncType: "INITIAL", regions: connection.enabledRegions || ["us-east-1"], status: "SUCCEEDED", startedAt, completedAt, errorSummary: null, resourcesDiscovered: discovered.length, resourcesUpdated: 0, resourcesRemoved: 0 },
    resources: discovered,
  };
}

module.exports = { runInventorySync, runMockInventorySync };
