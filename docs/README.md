# Guardian AI Platform Documentation

## Reading Order

1. [Guardian AI Platform Architecture](guardian-ai-platform-architecture.md) — design principles, planes, aspirational flows
2. [Guardian AI Platform Design](guardian-ai-platform-design.md) — product shape, roles, core workflows
3. [Agent Registry Model](agent-registry-model.md) — data model (as-built + aspirational)
4. [Runtime Governance Model](runtime-governance-model.md) — enforcement layers, policy, audit
5. [Local Development Guide](local-development.md) — running locally in mock / local / dev mode
6. [Mockups](mockups.md) — UI wireframes

## What Is Implemented (as of current build)

- **Org → Project → Agent hierarchy** with RBAC (ORG_ADMIN, PROJECT_ADMIN, MEMBER, VIEWER)
- **Tool lifecycle**: Register (POST /logical-tools) → org-admin approval → deploy to AgentCore Gateway → grant to project
- **Agent lifecycle**: 6-step Author Wizard → POST /api/agents/publish → dual approval (business_owner + platform_admin) → APPROVED → AgentCore Runtime deploy
- **Dual approval gate**: both `business_owner` and `platform_admin` `agent_approval_requests` rows must be approved via `POST /api/approvals/:taskId/decision`; either rejection sets agent to REJECTED immediately
- **AgentCore Gateway deploy**: Lambda direct targets or API Gateway via wrapper Lambda (pure Node ZIP, no system zip required)
- **AgentCore Runtime deploy**: Strands Python code generation → S3 upload → CreateAgentRuntime → poll READY → CreateAgentRuntimeEndpoint → Invoke
- **Runtime modes**: `mock` (SQLite + all mock providers), `local` (Postgres + mock cloud), `dev` (Postgres + real AWS)
- **AWS resource discovery**: Lambda, API Gateway, Bedrock Knowledge Bases via inventory scanner
- **Multi-environment**: DEV / STAGING / PROD environments per org; deployment blocked until `status = APPROVED`
- **Security**: secret refs as names only, no raw values; no hardcoded ARNs; deploy routes enforce environment_id consistency
- **Tests**: 9 unit tests + 68 API integration tests, all run in mock mode with in-memory SQLite

## Planned / Aspirational (not yet implemented)

- Security review as a distinct approval step (currently: business_owner + platform_admin only)
- Knowledge-base catalog and governance
- Long-term / short-term memory policy
- Arize AI observability integration
- Apigee delegated identity propagation
- Amazon Verified Permissions / Cedar policy engine
- Aurora PostgreSQL / DynamoDB for production-scale storage
- Version pinning and portable spec hash
- Agent suspension, revocation, and retirement flows
- Cross-project knowledge-base sharing

