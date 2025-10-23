# Investigation: Cannot Delete First Character of Edited Message

## Bug Description

When editing a task message after an agent run completes:
- User can delete characters from the end working backwards
- When trying to delete the final remaining character, it temporarily disappears but immediately reappears
- When selecting all characters and attempting to delete them, all characters are immediately restored
- This prevents the user from clearing the message entirely

## Code Flow Analysis

### 1. Component Hierarchy

The message editing flow involves these components:
```
RetryEditorInline (frontend/src/components/NormalizedConversation/RetryEditorInline.tsx)
  └─> FollowUpEditorCard (frontend/src/components/tasks/follow-up/FollowUpEditorCard.tsx)
      └─> FileSearchTextarea (frontend/src/components/ui/file-search-textarea.tsx)
          └─> AutoExpandingTextarea (frontend/src/components/ui/auto-expanding-textarea.tsx)
```

### 2. Draft Management Hooks

Three key hooks manage the draft state:

#### useDraftEditor (frontend/src/hooks/follow-up/useDraftEditor.ts)
- Manages local message state with `setMessage()` and `message`
- Tracks "dirty" state with `localDirtyRef` to know when local edits diverge from server
- **Critical Logic (lines 23-33):**
  ```typescript
  useEffect(() => {
    if (!draft) return;
    const serverPrompt = draft.prompt || '';
    if (!localDirtyRef.current) {
      setMessageInner(serverPrompt);
    } else if (serverPrompt === message) {
      // When server catches up to local text, clear dirty
      localDirtyRef.current = false;
    }
  }, [draft, message]);
  ```

#### useDraftStream (frontend/src/hooks/follow-up/useDraftStream.ts)
- Receives real-time draft updates via WebSocket using JSON Patch (RFC 6902)
- Updates React Query cache with server draft changes
- Provides the `draft` and `retryDraft` objects to components

#### useDraftAutosave (frontend/src/hooks/follow-up/useDraftAutosave.ts)
- Debounces draft saves with a 400ms timeout (line 158)
- Only saves if there are changes between local and server state
- Uses `diffBaseDraft()` to detect changes (lines 28-45)
- **Critical Logic (line 34):**
  ```typescript
  if (current.prompt !== serverPrompt) payload.prompt = current.prompt || '';
  ```
  Note: Empty string is coerced to empty string, but the diff check uses strict inequality

### 3. The Race Condition

#### Scenario: Deleting the Last Character

1. **User types "abc"**
   - Local state: `message = "abc"`
   - `localDirtyRef.current = true`
   - After 400ms: Autosave sends "abc" to server

2. **User deletes "c"**
   - Local state: `message = "ab"`
   - Still dirty: `localDirtyRef.current = true`
   - After 400ms: Autosave sends "ab" to server

3. **User deletes "b"**
   - Local state: `message = "a"`
   - After 400ms: Autosave sends "a" to server

4. **User tries to delete the last character "a"**
   - onChange handler fires → `message = ""`
   - `localDirtyRef.current = true`
   - 400ms debounce timer starts
   - **PROBLEM**: Before the debounce fires, WebSocket receives the previous save confirmation
   - WebSocket update triggers `useDraftEditor` effect with `draft.prompt = "a"`
   - Effect sees: `localDirtyRef.current = true` and `message !== serverPrompt`
   - Effect does nothing (correctly avoiding overwrite while dirty)
   - But then: `serverPrompt === message` check fails because server still has "a"

## Hypothesis: The Root Cause

The bug occurs due to a **timing issue** in [useDraftEditor.ts](file:///private/var/folders/5q/5vgq75y92dz0k7n62z93299r0000gn/T/vibe-kanban/worktrees/c70b-cannot-delete-fi/frontend/src/hooks/follow-up/useDraftEditor.ts#L23-L33):

### The Problem

When the user types "" (empty string):
1. Local message becomes `""` and `localDirtyRef = true`
2. The effect runs because `draft` or `message` changed
3. The condition check:
   ```typescript
   else if (serverPrompt === message) {
     localDirtyRef.current = false;
   }
   ```
   This clears the dirty flag when server catches up

**BUT**: There's a secondary effect that may be running. Looking at [RetryEditorInline.tsx lines 120-141](file:///private/var/folders/5q/5vgq75y92dz0k7n62z93299r0000gn/T/vibe-kanban/worktrees/c70b-cannot-delete-fi/frontend/src/components/NormalizedConversation/RetryEditorInline.tsx#L120-L141):

```typescript
// Safety net: if server provided a draft but local message is empty, force-apply once
useEffect(() => {
  if (!isRetryLoaded || !draft) return;
  const serverPrompt = draft.prompt || '';
  if (message === '' && serverPrompt !== '') {
    setMessage(serverPrompt);
    // Debug log...
  }
}, [attemptId, draft, executionProcessId, isRetryLoaded, message, setMessage]);
```

**THIS IS THE BUG!**

### The Exact Bug

In [RetryEditorInline.tsx lines 120-141](file:///private/var/folders/5q/5vgq75y92dz0k7n62z93299r0000gn/T/vibe-kanban/worktrees/c70b-cannot-delete-fi/frontend/src/components/NormalizedConversation/RetryEditorInline.tsx#L120-L141), there's a "safety net" effect that:
- Runs whenever `message` changes
- Checks if `message === ''` and `serverPrompt !== ''`
- If true, it **force-applies** the server prompt by calling `setMessage(serverPrompt)`

This effect is intended to handle hydration issues during initial load, but it runs continuously and has these dependencies:
- `message` is a dependency, so it runs **every time the user types**
- When the user deletes to empty string, the effect immediately detects `message === ''`
- If the server still has content from a previous autosave (even one character), it restores it

### Why It Happens

1. User has "a" in the textarea (both local and server)
2. User presses backspace → `message = ""`
3. The safety net effect runs (because `message` changed)
4. Condition `message === '' && serverPrompt !== ''` is TRUE (server still has "a")
5. Effect calls `setMessage("a")` → character is restored
6. Eventually autosave fires with "" but by then the local state is already "a" again

### Why Select-All-Delete Also Fails

Same mechanism - the moment the message becomes empty, the safety net effect fires and restores whatever the server has.

## Solution Recommendations

### Option 1: Remove or Guard the Safety Net (Recommended)

The safety net in [RetryEditorInline.tsx](file:///private/var/folders/5q/5vgq75y92dz0k7n62z93299r0000gn/T/vibe-kanban/worktrees/c70b-cannot-delete-fi/frontend/src/components/NormalizedConversation/RetryEditorInline.tsx#L120-L141) should either:

1. **Only run once on mount/initial load** by using a ref to track if it's been applied:
```typescript
const hasHydratedRef = useRef(false);
useEffect(() => {
  if (!isRetryLoaded || !draft || hasHydratedRef.current) return;
  const serverPrompt = draft.prompt || '';
  if (message === '' && serverPrompt !== '') {
    setMessage(serverPrompt);
    hasHydratedRef.current = true;
  }
}, [isRetryLoaded, draft?.prompt]); // Remove message from deps
```

2. **Check if user is actively editing** by checking the dirty ref from useDraftEditor:
```typescript
// Would need to expose isDirty from useDraftEditor
if (message === '' && serverPrompt !== '' && !isDirty) {
  setMessage(serverPrompt);
}
```

### Option 2: Add User Intent Detection

Track if the deletion was user-initiated vs. system-initiated and skip restoration for intentional user actions.

### Option 3: Add a Minimum Delay

Only apply the safety net after a delay (e.g., 100ms) to ensure it doesn't interfere with active typing.

## Verification Steps

To verify this hypothesis:
1. Add a console.log in the safety net effect when it fires
2. Attempt to delete the last character
3. Check if the console.log fires immediately after deletion
4. If yes, this confirms the bug

Alternative verification:
1. Comment out the safety net effect entirely
2. Test if deletion now works correctly
3. If yes, the safety net is the culprit
