# Frontend Forge

This directory will contain the new forge frontend that will replace the modified upstream frontend.

**Status**: Scaffolded - implementation pending in Task 3

**Architecture**:
- New forge UI will be served at `/` (root)
- Original upstream UI will be served at `/legacy`
- Both frontends will be embedded in the forge-app binary

**Next Steps**:
- Task 2: No frontend changes
- Task 3: Extract and migrate current frontend modifications
- Task 3: Set up dual frontend routing in forge-app