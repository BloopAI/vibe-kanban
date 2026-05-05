---
mb_meta:
  projectID: "{{project_id}}"
  version: "0.1.0"
  lastUpdated: "{{timestamp}}"
  templateVersion: "1.0"
  fileType: "techContext"
---

# {{project_name}} - Technical Context

## Issue Tracker
- **Provider**: {{issue_tracker_provider}}
- **issue_tracker**: {{issue_tracker_key}} <!-- vibe_kanban | github | local | jira -->
- **MCP Server**: {{issue_tracker_mcp_server}}
- **Organization**: {{issue_tracker_organization}} ({{issue_tracker_org_id}})
- **Project**: {{issue_tracker_project}} ({{issue_tracker_project_id}})
- **ID Prefix**: {{issue_tracker_id_prefix}}
- **Statuses**: {{issue_tracker_statuses}}
- **Issue Type Convention**: {{issue_tracker_type_convention}}
- **Type Taxonomy**: {{issue_tracker_type_taxonomy}}
- **Taxonomy Strictness**: {{issue_tracker_taxonomy_strictness}} <!-- recommended | required -->
- **ID Resolution**: {{issue_tracker_id_resolution}}
- **Local Mode Note**: if `issue_tracker = local`, MCP/org/project fields may be left as `n/a`

## PR/Git Operations
- **PR Workflow**: {{pr_workflow_tooling}}
- **Branch Convention**: {{branch_naming_convention}}
- **Commit Convention**: {{commit_message_convention}}

## Technology Stack
### Frontend
- **Framework**: {{frontend_framework}}
- **Language**: {{frontend_language}}
- **Key Libraries**: 
  - {{frontend_lib_1}}
  - {{frontend_lib_2}}
  - {{frontend_lib_3}}

### Backend
- **Framework**: {{backend_framework}}
- **Language**: {{backend_language}}
- **Runtime**: {{backend_runtime}}
- **Key Libraries**:
  - {{backend_lib_1}}
  - {{backend_lib_2}}
  - {{backend_lib_3}}

### Database
- **Primary Database**: {{primary_db}}
- **Caching**: {{cache_technology}}
- **Search**: {{search_technology}}

### Infrastructure
- **Cloud Provider**: {{cloud_provider}}
- **Container Platform**: {{container_platform}}
- **CI/CD**: {{cicd_platform}}
- **Monitoring**: {{monitoring_stack}}

## Development Environment
### Required Tools
- {{dev_tool_1}}: {{dev_tool_1_version}}
- {{dev_tool_2}}: {{dev_tool_2_version}}
- {{dev_tool_3}}: {{dev_tool_3_version}}

### Development Setup
#### Prerequisites
```bash
# {{prerequisite_installation_commands}}
```

#### Installation Steps

```bash
# {{installation_steps}}
```

#### Environment Configuration

```bash
# {{environment_config}}
```

### IDE/Editor Configuration

- **Recommended IDE**: {{recommended_ide}}
- **Required Extensions**:
    - {{extension_1}}
    - {{extension_2}}
    - {{extension_3}}



### Technical Constraints
#### Platform Constraints
{{platform_constraints}}

#### Performance Constraints
{{performance_constraints}}

#### Security Constraints
{{security_constraints}}

#### Compliance Requirements
{{compliance_requirements}}

### Dependencies & Integrations
#### External APIs

- {{api_1_name}}: {{api_1_purpose}} ({{api_1_version}})
- {{api_2_name}}: {{api_2_purpose}} ({{api_2_version}})
- {{api_3_name}}: {{api_3_purpose}} ({{api_3_version}})

#### Third-Party Services

- {{service_1_name}}: {{service_1_purpose}}
- {{service_2_name}}: {{service_2_purpose}}
- {{service_3_name}}: {{service_3_purpose}}

#### Internal Dependencies

- {{internal_dep_1}}: {{internal_dep_1_description}}
- {{internal_dep_2}}: {{internal_dep_2_description}}

### Build & Deployment
#### Build Process
```bash
# {{build_commands}}
```

#### Testing Strategy

Unit Tests: {{unit_test_framework}}
Integration Tests: {{integration_test_approach}}
E2E Tests: {{e2e_test_framework}}

#### Deployment Strategy

Environment: {{deployment_environment}}
Deployment Method: {{deployment_method}}
Rollback Strategy: {{rollback_strategy}}

#### Environment Variables
```bash
# {{environment_variables}}
```

### Quality & Standards
#### Code Quality Tools

- Linting: {{linting_tools}}
- Formatting: {{formatting_tools}}
- Type Checking: {{type_checking}}

#### Coding Standards

- {{coding_standard_1}}
- {{coding_standard_2}}
- {{coding_standard_3}}

#### Documentation Standards

- {{doc_standard_1}}
- {{doc_standard_2}}

### Known Technical Issues
#### Current Limitations

- {{limitation_1}}
- {{limitation_2}}
- {{limitation_3}}

#### Technical Debt

- {{tech_debt_1}}: {{tech_debt_1_impact}}
- {{tech_debt_2}}: {{tech_debt_2_impact}}

#### Planned Improvements

- {{improvement_1}}: {{improvement_1_timeline}}
- {{improvement_2}}: {{improvement_2_timeline}}
