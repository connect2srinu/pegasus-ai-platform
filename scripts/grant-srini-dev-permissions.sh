#!/bin/bash
# Run this as admin/root to grant srini_gadi the permissions needed to create
# sample Lambda functions, API Gateways, and write agent code to S3.
#
# These are narrow, resource-scoped policies — no IAM admin access.

set -e
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="${AWS_REGION:-us-east-1}"
echo "Granting dev permissions to srini_gadi in account $ACCOUNT_ID..."

# ── Policy 1: Lambda management for pegasus-* functions ──────────────────────
aws iam put-user-policy \
  --user-name srini_gadi \
  --policy-name PegasusLambdaAccess \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {
        \"Sid\":\"LambdaCRUD\",
        \"Effect\":\"Allow\",
        \"Action\":[
          \"lambda:CreateFunction\",
          \"lambda:UpdateFunctionCode\",
          \"lambda:UpdateFunctionConfiguration\",
          \"lambda:DeleteFunction\",
          \"lambda:GetFunction\",
          \"lambda:ListFunctions\",
          \"lambda:AddPermission\",
          \"lambda:TagResource\"
        ],
        \"Resource\":\"arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:pegasus-*\"
      },
      {
        \"Sid\":\"LambdaListAll\",
        \"Effect\":\"Allow\",
        \"Action\":[\"lambda:ListFunctions\"],
        \"Resource\":\"*\"
      },
      {
        \"Sid\":\"PassLambdaRole\",
        \"Effect\":\"Allow\",
        \"Action\":\"iam:PassRole\",
        \"Resource\":\"arn:aws:iam::${ACCOUNT_ID}:role/AmazonBedrockLambdaExecutionRole-*\",
        \"Condition\":{\"StringEquals\":{\"iam:PassedToService\":\"lambda.amazonaws.com\"}}
      }
    ]
  }"
echo "  Attached: PegasusLambdaAccess"

# ── Policy 2: API Gateway management for Pegasus* APIs ───────────────────────
aws iam put-user-policy \
  --user-name srini_gadi \
  --policy-name PegasusApiGatewayAccess \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[
      {
        "Sid":"ApiGatewayCRUD",
        "Effect":"Allow",
        "Action":[
          "apigateway:GET",
          "apigateway:POST",
          "apigateway:PUT",
          "apigateway:DELETE",
          "apigateway:PATCH"
        ],
        "Resource":"*"
      }
    ]
  }'
echo "  Attached: PegasusApiGatewayAccess"

# ── Policy 3: S3 artifact bucket write ───────────────────────────────────────
aws iam put-user-policy \
  --user-name srini_gadi \
  --policy-name PegasusArtifactS3Access \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Sid\":\"PegasusArtifacts\",
      \"Effect\":\"Allow\",
      \"Action\":[\"s3:PutObject\",\"s3:GetObject\",\"s3:ListBucket\",\"s3:DeleteObject\"],
      \"Resource\":[
        \"arn:aws:s3:::pegasus-agent-artifacts-${ACCOUNT_ID}\",
        \"arn:aws:s3:::pegasus-agent-artifacts-${ACCOUNT_ID}/*\"
      ]
    }]
  }"
echo "  Attached: PegasusArtifactS3Access"

echo ""
echo "Done. srini_gadi can now:"
echo "  - Create/manage Lambda functions named pegasus-*"
echo "  - Create/manage API Gateway REST APIs"
echo "  - Write agent code to s3://pegasus-agent-artifacts-${ACCOUNT_ID}"
echo ""
echo "Run scripts/setup-aws-sample-resources.sh next to create the sample resources."
