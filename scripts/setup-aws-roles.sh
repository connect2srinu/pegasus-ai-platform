#!/bin/bash
# =============================================================================
# Pegasus AI Platform — AWS IAM Setup Script
#
# Run this ONCE using AWS credentials that have iam:CreateRole and
# iam:PutRolePolicy permissions (root or an admin user/role).
#
# Usage:
#   AWS_REGION=us-east-1 bash scripts/setup-aws-roles.sh
#
# After this script completes, the regular srini_gadi user can run
# agents via the platform without any IAM permissions.
# =============================================================================
set -euo pipefail

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}
CALLER=$(aws sts get-caller-identity --query Arn --output text)

echo "=================================================="
echo " Pegasus AI Platform — IAM Role Setup"
echo " Account  : $ACCOUNT_ID"
echo " Region   : $REGION"
echo " Caller   : $CALLER"
echo "=================================================="
echo ""

# ── 1. AgentCoreExecutionRole ─────────────────────────────────────────────────
# This role is assumed BY the AgentCore Runtime service when running agent containers.
# Trust: bedrock-agentcore.amazonaws.com

ROLE_NAME="AgentCoreExecutionRole"
echo ">>> [1/3] Creating IAM role: $ROLE_NAME"

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AgentCoreServiceTrust",
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock-agentcore.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "'"$ACCOUNT_ID"'"
        }
      }
    }
  ]
}'

if aws iam get-role --role-name "$ROLE_NAME" > /dev/null 2>&1; then
  echo "    Role $ROLE_NAME already exists — skipping create."
  EXEC_ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)
else
  EXEC_ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --description "Execution role for Pegasus AI Platform AgentCore runtimes (single-account local dev)" \
    --tags Key=ManagedBy,Value=PegasusAIPlatform Key=Environment,Value=LocalDev \
    --query Role.Arn --output text)
  echo "    Created: $EXEC_ROLE_ARN"
fi

# ── 2. Permissions on AgentCoreExecutionRole ──────────────────────────────────
echo ""
echo ">>> [2/3] Attaching inline permissions policy to $ROLE_NAME..."

PERMS_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockModelInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:GetFoundationModel",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECRImagePull",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:'"$REGION"':'"$ACCOUNT_ID"':log-group:/aws/bedrock-agentcore/*"
    },
    {
      "Sid": "S3ArtifactAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::pegasus-agent-artifacts-'"$ACCOUNT_ID"'",
        "arn:aws:s3:::pegasus-agent-artifacts-'"$ACCOUNT_ID"'/*"
      ]
    },
    {
      "Sid": "XRayTracing",
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    }
  ]
}'

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "AgentCoreRuntimePermissions" \
  --policy-document "$PERMS_POLICY"
echo "    Inline policy AgentCoreRuntimePermissions attached."

# ── 3. Grant srini_gadi permission to pass this role to AgentCore ─────────────
# iam:PassRole lets the platform user (srini_gadi) pass AgentCoreExecutionRole
# to the bedrock-agentcore service when creating a runtime.
echo ""
echo ">>> [3/3] Creating PassRole policy for srini_gadi..."

PASSROLE_POLICY_NAME="PegasusAgentCorePassRole"

PASSROLE_DOC='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPassRoleToAgentCore",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::'"$ACCOUNT_ID"':role/AgentCoreExecutionRole",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "bedrock-agentcore.amazonaws.com"
        }
      }
    },
    {
      "Sid": "AllowGetRoleForValidation",
      "Effect": "Allow",
      "Action": "iam:GetRole",
      "Resource": "arn:aws:iam::'"$ACCOUNT_ID"':role/AgentCoreExecutionRole"
    }
  ]
}'

# Create or update inline policy on srini_gadi
if aws iam get-user-policy --user-name srini_gadi --policy-name "$PASSROLE_POLICY_NAME" > /dev/null 2>&1; then
  echo "    Policy $PASSROLE_POLICY_NAME already exists on srini_gadi — updating."
else
  echo "    Creating policy $PASSROLE_POLICY_NAME on user srini_gadi..."
fi

aws iam put-user-policy \
  --user-name srini_gadi \
  --policy-name "$PASSROLE_POLICY_NAME" \
  --policy-document "$PASSROLE_DOC"
echo "    PassRole policy attached to srini_gadi."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=================================================="
echo " IAM Setup Complete"
echo "=================================================="
echo ""
echo " Role ARN    : $EXEC_ROLE_ARN"
echo " PassRole    : srini_gadi can now pass this role to AgentCore"
echo ""
echo " Next steps (run as srini_gadi):"
echo "   bash scripts/setup-aws-resources.sh"
echo "=================================================="
