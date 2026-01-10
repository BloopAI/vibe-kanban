---
description: Created the Temporal Expert Agent slash command at ~/.claude/commands/temporal-agent.md.    Usage    /temporal-agent <your request>    Examples    /temporal-agent Create a test script to trigger PreCallConfigWorkflow    /temporal-agent Add a new acti
---

Created the Temporal Expert Agent slash command at ~/.claude/commands/temporal-agent.md.

  Usage

  /temporal-agent <your request>

  Examples

  /temporal-agent Create a test script to trigger PreCallConfigWorkflow

  /temporal-agent Add a new activity for sending notifications

  /temporal-agent Debug why worker is not connecting to Temporal server

  /temporal-agent Deploy the EndOfCallAnalysisWorkflow

  /temporal-agent Check the status of all Temporal workers

  What the Agent Knows
  Category: Code Paths
  Details: /temporal/src/, /engines/preCall-engine/src/
  ────────────────────────────────────────
  Category: Documentation
  Details: /docs-schild/devops/, /documentation/
  ────────────────────────────────────────
  Category: AWS Resources
  Details: ECS cluster, ECR repo, Cloud Map DNS, Security Groups
  ────────────────────────────────────────
  Category: Deployment Steps
  Details: Docker build, ECR push, Task definition, ECS service update
  ────────────────────────────────────────
  Category: MFA Setup
  Details: AWS_PROFILE=schild-mfa usage
  ────────────────────────────────────────
  Category: Troubleshooting
  Details: Common errors and fixes
  ────────────────────────────────────────
  Category: Workflow Architecture
  Details: 5-stage PreCallConfigWorkflow pipeline
  ---
  Would you like me to also create a test script to trigger a workflow so you can see it appear in the Temporal UI?