Load full project context for iKanban development.

## Step 1: Read project state
1. /Users/rupeshpanwar/Documents/docs/docs-ikanban/INDEX.md
2. /Users/rupeshpanwar/Documents/docs/docs-ikanban/PROJECT-STATUS.md

## Step 2: Read tech context
3. .claude/TECHSTACK.md (versions, packages)
4. .claude/PATTERNS.md (code conventions)
5. .claude/API.md (endpoints)

## Step 3: Check current tasks
```bash
python3 mcp/ikanban.py issues IKA --status inprogress
```

## Step 4: Summarize
- Current project state
- In-progress tasks
- Key tech decisions
- Relevant patterns for current work

If $ARGUMENTS provided, also search:
- /Users/rupeshpanwar/Documents/docs/docs-ikanban/**/*$ARGUMENTS*
