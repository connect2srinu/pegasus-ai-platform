# Guardian AI Platform Documentation

This folder contains the first reviewable architecture and design package for Guardian AI Platform.

## Reading Order

1. [Guardian AI Platform Architecture](guardian-ai-platform-architecture.md)
2. [Guardian AI Platform Design](guardian-ai-platform-design.md)
3. [Agent Registry Model](agent-registry-model.md)
4. [Runtime Governance Model](runtime-governance-model.md)
5. [Mockups](mockups.md)

## Current Scope

The current package covers:

- Control plane, execution plane, and business user plane.
- Full agent lifecycle and approval model.
- Normalized agent registry model.
- Project-based roles and security boundaries.
- Secret policy recommendations using AWS Secrets Manager, KMS, and SSM Parameter Store.
- Delegated identity propagation from Entra/JWT through AgentCore Runtime, AgentCore Gateway, Apigee, and downstream APIs.
- Tool governance using AgentCore Gateway with Guardian Tool Catalog as source of truth.
- Knowledge-base and memory governance.
- Runtime enforcement and audit model.
- Arize AI observability positioning.
- First-pass screen mockups.

## Open Items For Next Review

- Confirm exact AgentCore Runtime, Gateway, Identity, and Memory feature availability before implementation.
- Decide whether Aurora PostgreSQL alone is sufficient for registry storage, or whether DynamoDB is also needed for high-volume status/event reads.
- Define project-owner and platform-admin approval SLAs.
- Choose whether security review is a distinct human approval or a platform-admin responsibility supported by validation evidence.
- Define initial risk scoring rules for tools, models, KBs, memory, and secrets.
- Define whether cross-BU knowledge-base access is in MVP or phase 2.

