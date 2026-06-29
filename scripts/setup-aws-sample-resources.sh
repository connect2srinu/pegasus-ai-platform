#!/bin/bash
# Creates sample AWS resources for Guardian AI Platform local testing.
# Lambda functions and API Gateways incur NO cost unless invoked.
# AgentCore Gateway has per-hour cost — script will skip if you choose.
#
# Usage: bash scripts/setup-aws-sample-resources.sh
# Requires: AWS credentials with Lambda, API Gateway, and optionally bedrock-agentcore access.

set -e
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ -z "$ACCOUNT_ID" ]; then
  echo "ERROR: Could not resolve AWS account ID. Check ~/.aws/credentials."
  exit 1
fi
echo "Account: $ACCOUNT_ID  Region: $REGION"
echo ""

# ── Lambda execution role ─────────────────────────────────────────────────────
# Use existing Bedrock Lambda role (no iam:CreateRole needed)
LAMBDA_ROLE_ARN=$(aws iam list-roles \
  --query "Roles[?starts_with(RoleName,'AmazonBedrockLambdaExecutionRole')].Arn | [0]" \
  --output text 2>/dev/null)
if [ -z "$LAMBDA_ROLE_ARN" ] || [ "$LAMBDA_ROLE_ARN" = "None" ]; then
  echo "ERROR: No AmazonBedrockLambdaExecutionRole found. Run scripts/grant-srini-dev-permissions.sh as admin first."
  exit 1
fi
echo "Using Lambda role: $LAMBDA_ROLE_ARN"

# ── Minimal Python stub for all sample Lambdas ───────────────────────────────
LAMBDA_ZIP=$(mktemp /tmp/lambda-XXXXXX.zip)
python3 -c "
import zipfile, os
code = b'''
import json

def lambda_handler(event, context):
    return {\"statusCode\": 200, \"body\": json.dumps({\"message\": \"stub response\", \"event\": event})}
'''
with zipfile.ZipFile('${LAMBDA_ZIP}', 'w') as z:
    z.writestr('handler.py', code)
print('stub zip created')
"

# ── Lambda functions ──────────────────────────────────────────────────────────
echo ""
echo "=== Lambda functions ==="

create_lambda() {
  local FN_NAME="$1"
  local DESCRIPTION="$2"
  if aws lambda get-function --function-name "$FN_NAME" --region "$REGION" > /dev/null 2>&1; then
    echo "  Already exists: $FN_NAME"
  else
    aws lambda create-function \
      --function-name "$FN_NAME" \
      --runtime "python3.12" \
      --handler "handler.lambda_handler" \
      --role "$LAMBDA_ROLE_ARN" \
      --zip-file "fileb://${LAMBDA_ZIP}" \
      --description "$DESCRIPTION" \
      --timeout 30 \
      --memory-size 256 \
      --region "$REGION" \
      --tags "Project=Pegasus,Environment=dev" \
      --output json > /dev/null
    echo "  Created: $FN_NAME"
  fi
}

create_lambda "pegasus-claims-lookup"      "Look up claim details by claim ID. Returns status, amounts, and processing history."
create_lambda "pegasus-policy-lookup"      "Retrieve insurance policy details and coverage terms by policy number."
create_lambda "pegasus-member-lookup"      "Look up member profile, enrollment status, and plan details."
create_lambda "pegasus-benefits-lookup"    "Look up benefits eligibility and coverage limits for a member."
create_lambda "pegasus-billing-calculator" "Calculate billing amounts, co-pays, and deductibles for a claim."

rm -f "$LAMBDA_ZIP"

# ── API Gateway REST APIs ─────────────────────────────────────────────────────
echo ""
echo "=== API Gateway REST APIs ==="

create_api_gateway() {
  local API_NAME="$1"
  local DESCRIPTION="$2"
  local EXISTING=$(aws apigateway get-rest-apis --region "$REGION" \
    --query "items[?name=='${API_NAME}'].id" --output text 2>/dev/null)
  if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
    echo "  Already exists: $API_NAME  (id: $EXISTING)"
  else
    API_ID=$(aws apigateway create-rest-api \
      --name "$API_NAME" \
      --description "$DESCRIPTION" \
      --endpoint-configuration '{"types":["REGIONAL"]}' \
      --region "$REGION" \
      --tags "Project=Pegasus,Environment=dev" \
      --query id --output text 2>/dev/null)
    echo "  Created: $API_NAME  (id: $API_ID)"
  fi
}

create_api_gateway "PegasusClaimsAPI"        "Claims processing REST API — GET/POST claims, status updates"
create_api_gateway "PegasusMemberServicesAPI" "Member services REST API — member lookup, benefits, coverage"
create_api_gateway "PegasusBillingAPI"        "Billing REST API — invoices, payments, refund status"

# ── AgentCore Gateway ─────────────────────────────────────────────────────────
echo ""
echo "=== AgentCore Gateway ==="
echo "  NOTE: AgentCore Gateway has per-hour pricing."
read -r -p "  Create AgentCore Gateway? (y/N): " CREATE_GW
CREATE_GW="${CREATE_GW,,}"

if [ "$CREATE_GW" = "y" ] || [ "$CREATE_GW" = "yes" ]; then
  GW_NAME="pegasus-local-gateway"
  # Get AgentCore execution role ARN
  EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/AgentCoreExecutionRole"

  # Check if gateway already exists
  EXISTING_GW=$(aws bedrock-agentcore-control list-agent-gateways \
    --region "$REGION" \
    --query "agentGateways[?agentGatewayName=='${GW_NAME}'].agentGatewayId" \
    --output text 2>/dev/null || echo "")

  if [ -n "$EXISTING_GW" ] && [ "$EXISTING_GW" != "None" ]; then
    echo "  Already exists: $GW_NAME  (id: $EXISTING_GW)"
  else
    echo "  Creating gateway: $GW_NAME..."
    GW_RESULT=$(aws bedrock-agentcore-control create-agent-gateway \
      --agent-gateway-name "$GW_NAME" \
      --role-arn "$EXEC_ROLE_ARN" \
      --region "$REGION" \
      --output json 2>&1)
    if echo "$GW_RESULT" | grep -q '"agentGatewayId"'; then
      GW_ID=$(echo "$GW_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['agentGatewayId'])")
      echo "  Created: $GW_NAME  (id: $GW_ID)"

      # Add Lambda targets
      CLAIMS_FN_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:pegasus-claims-lookup"
      MEMBER_FN_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:pegasus-member-lookup"

      echo "  Adding Lambda targets..."
      aws bedrock-agentcore-control create-agent-gateway-target \
        --agent-gateway-id "$GW_ID" \
        --target-name "claims-lookup-target" \
        --lambda-function-target "lambdaFunctionArn=${CLAIMS_FN_ARN}" \
        --region "$REGION" --output json > /dev/null 2>&1 || echo "  (claims target skipped)"
      aws bedrock-agentcore-control create-agent-gateway-target \
        --agent-gateway-id "$GW_ID" \
        --target-name "member-lookup-target" \
        --lambda-function-target "lambdaFunctionArn=${MEMBER_FN_ARN}" \
        --region "$REGION" --output json > /dev/null 2>&1 || echo "  (member target skipped)"
    else
      echo "  Gateway creation failed or API not available:"
      echo "  $GW_RESULT" | head -3
    fi
  fi
else
  echo "  Skipped."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Done ==="
echo "Resources created in account $ACCOUNT_ID, region $REGION."
echo ""
echo "Lambda functions:"
aws lambda list-functions --region "$REGION" \
  --query "Functions[?starts_with(FunctionName,'pegasus-')].FunctionName" \
  --output table 2>/dev/null || echo "  (listing skipped)"
echo ""
echo "API Gateways:"
aws apigateway get-rest-apis --region "$REGION" \
  --query "items[?starts_with(name,'Pegasus')].{Name:name,Id:id}" \
  --output table 2>/dev/null || echo "  (listing skipped)"
echo ""
echo "Next: restart the server and click 'Sync Now' in the Connected Accounts tab."
echo "The inventory scanner will pull these real resources from AWS."
