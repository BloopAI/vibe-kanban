# Component Specification: [ComponentName]

**Type:** [service|module|adapter|UI|middleware|library]
**Status:** active
**Version:** 1.0.0
**Formality:** [standard | backfilled (rapid) | backfilled (standard)]
**Story Reference:** [GIF-xxx or #xxx — link to parent story issue, or "none"]

## Overview
<!-- Component purpose in 1-2 sentences -->
[Brief description]

## API Contract
```typescript
// Public interface
interface [ComponentName] {
  method1(param: Type): ReturnType;
  method2(param: Type): Promise<ReturnType>;
}
```

## Data Model
```typescript
// Core data structures
interface EntityName {
  id: string;
  // Essential fields only
  createdAt: Date;
  updatedAt: Date;
}
```

## Dependencies
<!-- External dependencies -->
- **[Service/Package]**: [Purpose]

## Error Handling
<!-- Key error scenarios -->
- **ValidationError**: [When it occurs]
- **NotFoundError**: [When it occurs]

## Testing Strategy
<!-- Coverage goals -->
- Unit tests: Core logic
- Integration tests: API contracts
- Coverage target: >80%

## Security
<!-- If applicable -->
- Authentication: [Method]
- Authorization: [Strategy]

## Linked Specifications
- **Task**: [TASK-xxx](../../.holicode/specs/tasks/TASK-xxx.md)
- **Story**: [STORY-xxx](../../.holicode/specs/stories/STORY-xxx.md)

## Change Log
### {{ISO_DATE}} - Initial
- **Changes**: Created specification
- **Author**: [workflow/person]
