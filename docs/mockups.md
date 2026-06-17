# Guardian AI Platform Mockups

These are first-pass wireframes for architecture review. They describe information architecture and workflow, not final visual styling.

## 1. Project Workspace

Purpose: default landing page for a logged-in user.

```text
+--------------------------------------------------------------------------------+
| Guardian AI Platform                         Project: Claims Operations [v]     |
| Agents | Tools | Knowledge | Secrets | Approvals | Runs | Audit | Settings      |
+--------------------------------------------------------------------------------+
| Overview                                                                       |
|                                                                                |
| Agents                      Runs                         Approvals             |
| +----------------------+    +----------------------+     +------------------+   |
| | 12 approved          |    | 184 last 24h         |     | 3 pending        |   |
| | 2 in review          |    | 6 failed             |     | 1 blocked        |   |
| +----------------------+    +----------------------+     +------------------+   |
|                                                                                |
| Approved Agents                                                                |
| +------------------+------------+----------+----------+---------------------+   |
| | Name             | Runtime    | Version  | Status   | Last Run            |   |
| | Claims Assistant | AgentCore  | 1.0.0    | Deployed | 8 minutes ago       |   |
| | Policy Guide     | AgentCore  | 0.9.4    | Approved | Not deployed        |   |
| +------------------+------------+----------+----------+---------------------+   |
+--------------------------------------------------------------------------------+
```

Key controls:

- Project switcher.
- Role-aware primary action: Register Agent, Run Agent, or View Only.
- Status filters for approved, in review, deployed, suspended.

## 2. Agent Registry List

Purpose: show lifecycle and deployment status across project agents.

```text
+--------------------------------------------------------------------------------+
| Agents                                                [Register Agent]          |
+--------------------------------------------------------------------------------+
| Search agents...                 Status [All v] Runtime [All v] Risk [All v]   |
|                                                                                |
| +------------------+---------+-------------+---------------+------+----------+ |
| | Agent            | Version | Lifecycle   | Deployment    | Risk | Owner    | |
| | Claims Assistant | 1.0.0   | Approved    | Prod deployed | Med  | Priya    | |
| | Billing Helper   | 0.3.0   | Admin review| Not deployed  | High | Marcus   | |
| | Policy Guide     | 0.9.4   | Submitted   | Not deployed  | Low  | Anika    | |
| +------------------+---------+-------------+---------------+------+----------+ |
+--------------------------------------------------------------------------------+
```

Expected row actions:

- View details.
- Submit new version.
- Request deployment.
- Suspend deployment.
- View audit.

## 3. Register Agent Wizard

Purpose: submit a normalized portable agent spec.

```text
+--------------------------------------------------------------------------------+
| Register Agent                                                                 |
+--------------------------------------------------------------------------------+
| Step 1 Basics | Step 2 Runtime | Step 3 Tools | Step 4 Knowledge | Step 5 Review |
|                                                                                |
| Agent name        [ Claims Assistant                                      ]     |
| Agent type        [ LangGraph v ]                                             |
| Runtime target    [ Amazon Bedrock AgentCore v ]                              |
| Model provider    [ Amazon Bedrock v ]                                        |
| Model             [ anthropic.claude-3-5-sonnet v ]                           |
|                                                                                |
| Portable spec upload   [ Choose file ]     Spec hash: pending                  |
|                                                                                |
| [Save Draft]                                               [Validate Spec]     |
+--------------------------------------------------------------------------------+
```

Validation panel:

```text
+-------------------------------- Validation -----------------------------------+
| PASS Schema format                                                             |
| PASS Project ownership                                                         |
| WARN Long-term memory requires retention policy                                |
| FAIL Tool payment_update is not approved for this project                      |
+--------------------------------------------------------------------------------+
```

## 4. Agent Detail

Purpose: one operational page for review, approval, deployment, and troubleshooting.

```text
+--------------------------------------------------------------------------------+
| Claims Assistant                         Lifecycle: Approved     Risk: Medium  |
| Version 1.0.0     Runtime: AgentCore     Project: Claims Operations            |
+--------------------------------------------------------------------------------+
| Summary | Versions | Tools | Knowledge | Memory | Approvals | Deployments | Runs |
|                                                                                |
| Runtime                                                                       |
| +----------------------+----------------------+-----------------------------+   |
| | AgentCore Runtime ID | agc-runtime-123      | Environment: prod           |   |
| | Model                | Claude 3.5 Sonnet    | Observability: Arize linked |   |
| +----------------------+----------------------+-----------------------------+   |
|                                                                                |
| Tools                                                                          |
| +-------------+---------+----------+-------------+-------------------------+   |
| | Tool        | Version | Risk     | Auth Mode   | API                     |   |
| | claim_lookup| 1.0.0   | Medium   | Delegated   | Apigee /claims/lookup   |   |
| +-------------+---------+----------+-------------+-------------------------+   |
|                                                                                |
| [Request Deployment] [Suspend] [View Audit]                                    |
+--------------------------------------------------------------------------------+
```

## 5. Approval Queue

Purpose: project owners and platform admins review agent versions.

```text
+--------------------------------------------------------------------------------+
| Approvals                                                Role: Platform Admin   |
+--------------------------------------------------------------------------------+
| +------------------+---------+-------------+---------+----------+------------+ |
| | Agent            | Version | Needed From | Risk    | Age      | Action     | |
| | Billing Helper   | 0.3.0   | Platform    | High    | 2 days   | Review     | |
| | Claims Assistant | 1.1.0   | Project     | Medium  | 4 hours  | View       | |
| +------------------+---------+-------------+---------+----------+------------+ |
+--------------------------------------------------------------------------------+
```

Review page:

```text
+--------------------------------------------------------------------------------+
| Review Billing Helper v0.3.0                                                   |
+--------------------------------------------------------------------------------+
| Validation Results        Tool Risk        Knowledge Access        Secrets      |
| PASS Schema               HIGH payments    claims-kb attached      1 reference  |
| PASS Runtime              MED customer     billing-kb requested    rotation ok  |
| FAIL Project policy                                                          |
|                                                                                |
| Decision comment                                                              |
| [                                                                    ]         |
|                                                                                |
| [Reject]                                                   [Approve]           |
+--------------------------------------------------------------------------------+
```

## 6. Tool Catalog

Purpose: govern AgentCore Gateway tools and Apigee mappings.

```text
+--------------------------------------------------------------------------------+
| Tool Catalog                                             [Register Tool]        |
+--------------------------------------------------------------------------------+
| +--------------+----------+---------+--------------+-------------+-----------+ |
| | Tool         | Version  | Risk    | Auth Mode    | Provider    | Status    | |
| | claim_lookup | 1.0.0    | Medium  | Delegated    | Apigee      | Approved  | |
| | payment_post | 1.2.1    | Critical| Delegated    | Apigee      | Restricted| |
| +--------------+----------+---------+--------------+-------------+-----------+ |
+--------------------------------------------------------------------------------+
```

Tool detail should show:

- AgentCore Gateway mapping.
- Apigee endpoint.
- Required scopes.
- Allowed projects.
- Allowed agents.
- Rate limits.
- Audit level.
- Version contract.

## 7. Knowledge Base Attachments

Purpose: project owners attach BU-owned knowledge bases to a project.

```text
+--------------------------------------------------------------------------------+
| Knowledge Bases                                      Project: Claims Operations |
+--------------------------------------------------------------------------------+
| Attached                                                                       |
| +------------------+----------+------------+-------------------------------+   |
| | Claims Policy KB | Claims   | Bedrock KB | Attached by project owner     |   |
| +------------------+----------+------------+-------------------------------+   |
|                                                                                |
| Available To Request                                                           |
| +------------------+----------+------------+-------------------------------+   |
| | Billing FAQ KB   | Billing  | OpenSearch | Requires BU owner approval    |   |
| +------------------+----------+------------+-------------------------------+   |
+--------------------------------------------------------------------------------+
```

## 8. Secret Policies

Purpose: create and manage secret references and access policy.

```text
+--------------------------------------------------------------------------------+
| Secrets                                                [Create Secret Reference]|
+--------------------------------------------------------------------------------+
| +----------------------+-----------------+-------------+----------+----------+ |
| | Name                 | Provider        | Scope       | Rotation | Status   | |
| | apigee-claims-client | Secrets Manager | Project     | 30 days  | Active   | |
| +----------------------+-----------------+-------------+----------+----------+ |
+--------------------------------------------------------------------------------+
```

Secret detail should show:

- ARN.
- KMS key.
- Environment.
- Allowed agents.
- Allowed tools.
- Rotation policy.
- Last access events.

## 9. Run Trace

Purpose: inspect a single runtime execution.

```text
+--------------------------------------------------------------------------------+
| Run run-20260616-001                Agent: Claims Assistant      Status: Success|
+--------------------------------------------------------------------------------+
| User: alex@example.com       Project: Claims Operations       Duration: 12.4s   |
|                                                                                |
| Timeline                                                                       |
| 00.0s Runtime authorization passed                                             |
| 01.2s Model invocation                                                         |
| 03.4s Tool claim_lookup called through AgentCore Gateway                       |
| 04.1s Apigee authorized /claims/lookup                                         |
| 06.8s Knowledge retrieval from Claims Policy KB                                |
| 12.4s Final response returned                                                  |
|                                                                                |
| [Open in Arize] [View Audit Events] [Export Trace]                             |
+--------------------------------------------------------------------------------+
```

## 10. Project Settings

Purpose: control project-level roles and policy boundaries.

```text
+--------------------------------------------------------------------------------+
| Project Settings                                     Claims Operations          |
+--------------------------------------------------------------------------------+
| Users and Roles                                                                 |
| +--------------------+---------------+-------------------------+               |
| | User               | Role          | Last Active             |               |
| | priya@example.com  | Project owner | Today                   |               |
| | alex@example.com   | Business user | Today                   |               |
| +--------------------+---------------+-------------------------+               |
|                                                                                |
| Policy Defaults                                                                |
| Runtime targets       [ AgentCore only v ]                                     |
| Long-term memory      [ Requires owner approval ]                              |
| Critical tools        [ Platform admin approval required ]                     |
| Cross-BU knowledge    [ BU owner approval required ]                           |
+--------------------------------------------------------------------------------+
```

