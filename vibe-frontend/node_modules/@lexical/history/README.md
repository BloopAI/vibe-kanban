# `@lexical/history`

[![See API Documentation](https://lexical.dev/img/see-api-documentation.svg)](https://lexical.dev/docs/api/modules/lexical_history)

This package contains history helpers for Lexical.

### Methods

#### `registerHistory`

Registers necessary listeners to manage undo/redo history stack and related editor commands. It returns `unregister` callback that cleans up all listeners and should be called on editor unmount.

```js
function registerHistory(
  editor: LexicalEditor,
  externalHistoryState: HistoryState,
  delay: number,
): () => void
```

### Commands

History package handles `UNDO_COMMAND`, `REDO_COMMAND` and `CLEAR_HISTORY_COMMAND` commands. It also triggers `CAN_UNDO_COMMAND` and `CAN_REDO_COMMAND` commands when history state is changed. These commands could be used to work with history state:

```jsx
import {UNDO_COMMAND, REDO_COMMAND} from 'lexical';

<Toolbar>
  <Button onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>Undo</Button>
  <Button onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>Redo</Button>
</Toolbar>;
```
