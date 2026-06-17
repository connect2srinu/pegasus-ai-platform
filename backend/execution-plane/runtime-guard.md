# Runtime Guard Contract

The runtime guard is the execution-plane enforcement component that checks every invocation before model, memory, knowledge, or tool access.

## Invocation Decision

Input:

```json
{
  "jwt": "entra-user-token",
  "projectId": "claims-operations",
  "agentId": "claims-assistant",
  "agentVersion": "1.0.0",
  "deploymentId": "deploy-456",
  "environment": "prod",
  "action": "invoke_agent"
}
```

Decision:

```json
{
  "decision": "permit",
  "policySnapshotId": "snapshot-789",
  "identityMode": "delegated_user",
  "allowedTools": ["claim_lookup", "policy_lookup"],
  "allowedKnowledgeBases": ["claims-policy-kb"],
  "memory": {
    "shortTerm": true,
    "longTerm": false
  }
}
```

## Enforcement Rules

- Deny if JWT is invalid.
- Deny if user is not a member of the project.
- Deny if agent version is not approved and deployed.
- Deny if deployment is suspended or revoked.
- Deny if requested tool is not in the policy snapshot.
- Deny if requested KB is not attached to the project.
- Deny if secret reference is revoked or outside environment scope.
- Emit audit event for every permit or deny.

