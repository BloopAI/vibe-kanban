---
mb_meta:
  projectID: "{{PROJECT_ID}}"
  version: "0.1.0"
  lastUpdated: "{{ISO_DATE}}"
  templateVersion: "1.0"
  fileType: "delegationContext"
---

# Delegation Context - {{PROJECT_NAME}}

## Decision Delegation Settings

### Business Decisions
- **Default Mode**: require_human_approval
- **Delegated to AI**: false
- **Approval Roles**: [Product_Owner, Product_Manager, Founder]
- **Delegation Scope**: []
- **Explicit Opt-outs**: []

### Technical Decisions
- **Default Mode**: require_human_approval
- **Delegated to AI**: false
- **Approval Roles**: [Architect, CTO, Tech_Lead]
- **Delegation Scope**: []
- **Explicit Opt-outs**: []

### UI/Design Decisions
- **Default Mode**: require_human_approval
- **Delegated to AI**: false
- **Approval Roles**: [Designer, UX_Lead]
- **Delegation Scope**: []
- **Explicit Opt-outs**: []

### Autonomous Roles

#### TPM (Tech Project Manager)
- **Enabled**: false
- **Cadence**: on_demand

## Maturity Indicators

### Business Context
- **Quality Level**: low | medium | high
- **Assessment Date**: {{ISO_DATE}}
- **Indicators**:
  - [ ] Clear problem statement exists
  - [ ] Success metrics defined
  - [ ] Stakeholders identified
  - [ ] Constraints documented
  - [ ] Scope boundaries clear

### Technical Architecture
- **Maturity Level**: exploratory | defined | mature
- **Assessment Date**: {{ISO_DATE}}
- **Indicators**:
  - [ ] Architecture patterns established
  - [ ] Technology stack finalized
  - [ ] Security model defined
  - [ ] Performance requirements clear
  - [ ] Operational model documented

### Team Experience
- **Level**: beginner | intermediate | expert
- **With HoliCode**: {{EXPERIENCE_LEVEL}}
- **Domain Expertise**: {{DOMAIN_LEVEL}}
- **AI Collaboration**: {{AI_EXPERIENCE_LEVEL}}

## Delegation History
<!-- Track when and why delegation settings changed -->

### {{ISO_DATE}} - Initial Setup
- All decisions default to human approval
- No delegations configured
- Reason: New project initialization

## Notes
- Delegation requires explicit opt-out with documented reasoning
- Changes to delegation settings should be tracked in history
- Regular review recommended (monthly/quarterly)
