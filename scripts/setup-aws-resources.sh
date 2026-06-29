#!/bin/bash
# =============================================================================
# Pegasus AI Platform — AWS Resource Setup Script
#
# Run this as srini_gadi (or any user with S3, ECR, and Logs permissions).
# Run setup-aws-roles.sh FIRST (requires admin/root credentials).
#
# Creates:
#   - ECR repository  : pegasus/agents
#   - S3 bucket       : pegasus-agent-artifacts-<account-id>
#   - CloudWatch log group : /aws/bedrock-agentcore/runtimes
#
# Usage:
#   AWS_REGION=us-east-1 bash scripts/setup-aws-resources.sh
# =============================================================================
set -euo pipefail

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}
CALLER=$(aws sts get-caller-identity --query Arn --output text)

echo "=================================================="
echo " Pegasus AI Platform — AWS Resource Setup"
echo " Account : $ACCOUNT_ID"
echo " Region  : $REGION"
echo " Caller  : $CALLER"
echo "=================================================="
echo ""

# ── 1. ECR repository ─────────────────────────────────────────────────────────
ECR_REPO="pegasus/agents"
echo ">>> [1/3] Creating ECR repository: $ECR_REPO..."

if aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$REGION" > /dev/null 2>&1; then
  echo "    ECR repo $ECR_REPO already exists — skipping."
  ECR_URI=$(aws ecr describe-repositories \
    --repository-names "$ECR_REPO" --region "$REGION" \
    --query "repositories[0].repositoryUri" --output text)
else
  ECR_URI=$(aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --region "$REGION" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    --query "repository.repositoryUri" --output text)
  echo "    Created: $ECR_URI"
fi

# ── 2. S3 artifact bucket ─────────────────────────────────────────────────────
BUCKET="pegasus-agent-artifacts-$ACCOUNT_ID"
echo ""
echo ">>> [2/3] Creating S3 bucket: $BUCKET..."

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "    S3 bucket $BUCKET already exists — skipping."
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  # Versioning and public-access-block require s3:PutBucketVersioning — skip if not allowed
  aws s3api put-bucket-versioning \
    --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled 2>/dev/null \
    && echo "    Versioning enabled." \
    || echo "    Versioning skipped (insufficient permission — not required for local dev)."
  aws s3api put-public-access-block \
    --bucket "$BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true 2>/dev/null \
    || echo "    Public access block skipped (insufficient permission — bucket is private by default)."
  echo "    Created."
fi

# ── 3. CloudWatch Log Group ───────────────────────────────────────────────────
LOG_GROUP="/aws/bedrock-agentcore/runtimes"
echo ""
echo ">>> [3/3] Creating CloudWatch log group: $LOG_GROUP..."

EXISTING=$(aws logs describe-log-groups \
  --log-group-name-prefix "$LOG_GROUP" \
  --region "$REGION" \
  --query "logGroups[?logGroupName=='$LOG_GROUP'].logGroupName" \
  --output text 2>/dev/null)

if [ -n "$EXISTING" ]; then
  echo "    Log group $LOG_GROUP already exists — skipping."
else
  aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION"
  aws logs put-retention-policy \
    --log-group-name "$LOG_GROUP" \
    --retention-in-days 30 \
    --region "$REGION" 2>/dev/null \
    || echo "    Retention policy skipped (insufficient permission — logs will use default retention)."
  echo "    Created."
fi

# ── Verify IAM role exists ────────────────────────────────────────────────────
echo ""
echo ">>> Verifying AgentCoreExecutionRole..."
ROLE_ARN=$(aws iam get-role --role-name AgentCoreExecutionRole --query Role.Arn --output text 2>/dev/null || echo "NOT FOUND")
if [ "$ROLE_ARN" = "NOT FOUND" ]; then
  echo ""
  echo "  WARNING: AgentCoreExecutionRole not found!"
  echo "  Run setup-aws-roles.sh first using admin credentials."
  echo ""
else
  echo "    Found: $ROLE_ARN"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=================================================="
echo " Resource Setup Complete"
echo "=================================================="
echo " ECR repository     : $ECR_URI"
echo " S3 artifact bucket : $BUCKET"
echo " CloudWatch log grp : $LOG_GROUP"
echo " Execution role     : $ROLE_ARN"
echo ""
echo " Add to .env.local:"
echo "   LOCAL_AWS_MODE=true"
echo "   AWS_REGION=$REGION"
echo ""
echo " Then start the platform:"
echo "   node scripts/static-server.cjs"
echo "=================================================="
