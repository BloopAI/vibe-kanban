# `lexical`

[![See API Documentation](https://lexical.dev/img/see-api-documentation.svg)](https://lexical.dev/docs/api/modules/lexical)

Lexical is an extensible JavaScript web text-editor framework with an emphasis on reliability, accessibility, and performance. Lexical aims to provide a best-in-class developer experience, so you can easily prototype and build features with confidence. Combined with a highly extensible architecture, Lexical allows developers to create unique text editing experiences that scale in size and functionality.

The core of Lexical is a dependency-free text editor engine that allows for powerful, simple and complex,
editor implementations to be built on top. Lexical's engine provides three main parts:

- editor instances that each attach to a single content editable element.
- a set of editor states that represent the current and pending states of the editor at any given time.
- a DOM reconciler that takes a set of editor states, diffs the changes, and updates the DOM according to their state.

By design, the core of Lexical tries to be as minimal as possible.
Lexical doesn't directly concern itself with things that monolithic editors tend to do – such as UI components, toolbars or rich-text features and markdown. Instead
the logic for those features can be included via a plugin interface and used as and when they're needed. This ensures great extensibility and keeps code-sizes
to a minimum – ensuring apps only pay the cost for what they actually import.

For React apps, Lexical has tight integration with React 18+ via the optional `@lexical/react` package. This package provides
production-ready utility functions, helpers and React hooks that make it seamless to create text editors within React.

## Usage

The `lexical` package contains only the core Lexical engine and nodes. This package is intended to be used in conjunction with packages that wire Lexical up to applications, such as `@lexical/react`.

## Working with Lexical

This section covers how to use Lexical, independently of any framework or library. For those intending to use Lexical in their React applications,
it's advisable to [check out the source-code for the hooks that are shipped in `@lexical/react`](https://github.com/facebook/lexical/tree/main/packages/lexical-react/src).

### Creating an editor and using it

When you work with Lexical, you normally work with a single editor instance. An editor instance can be thought of as the one responsible
for wiring up an EditorState with the DOM. The editor is also the place where you can register custom nodes, add listeners, and transforms.

An editor instance can be created from the `lexical` package and accepts an optional configuration object that allows for theming and other options:

```js
import {createEditor} from 'lexical';

const config = {
  namespace: 'MyEditor',
  theme: {
    ...
  },
};

const editor = createEditor(config);
```

Once you have an editor instance, when ready, you can associate the editor instance with a content editable `<div>` element in your document:

```js
const contentEditableElement = document.getElementById('editor');

editor.setRootElement(contentEditableElement);
```

If you want to clear the editor instance from the element, you can pass `null`. Alternatively, you can switch to another element if need be,
just pass an alternative element reference to `setRootElement()`.

### Understanding the Editor State

With Lexical, the source of truth is not the DOM, but rather an underlying state model
that Lexical maintains and associates with an editor instance. You can get the latest
editor state from an editor by calling `editor.getEditorState()`.

Editor states have two phases:

- During an update they can be thought of as "mutable". See "Updating an editor" below to
  mutate an editor state.
- After an update, the editor state is then locked and deemed immutable from there one. This
  editor state can therefore be thought of as a "snapshot".

Editor states contain two core things:

- The editor node tree (starting from the root node).
- The editor selection (which can be null).

Editor states are serializable to JSON, and the editor instance provides a useful method
to deserialize stringified editor states.

```js
const stringifiedEditorState = JSON.stringify(editor.getEditorState().toJSON());

const newEditorState = editor.parseEditorState(stringifiedEditorState);
```

### Updating an editor

There are a few ways to update an editor instance:

- Trigger an update with `editor.update()`
- Setting the editor state via `editor.setEditorState()`
- Applying a change as part of an existing update via `editor.registerNodeTransform()`
- Using a command listener with `editor.registerCommand(EXAMPLE_COMMAND, () => {...}, priority)`

The most common way to update the editor is to use `editor.update()`. Calling this function
requires a function to be passed in that will provide access to mutate the underlying
editor state. When starting a fresh update, the current editor state is cloned and
used as the starting point. From a technical perspective, this means that Lexical leverages a technique
called double-buffering during updates. There's an editor state to represent what is current on
the screen, and another work-in-progress editor state that represents future changes.

Creating an update is typically an async process that allows Lexical to batch multiple updates together in
a single update – improving performance. When Lexical is ready to commit the update to
the DOM, the underlying mutations and changes in the update will form a new immutable
editor state. Calling `editor.getEditorState()` will then return the latest editor state
based on the changes from the update.

Here's an example of how you can update an editor instance:

```js
import {$getRoot, $getSelection} from 'lexical';
import {$createParagraphNode} from 'lexical/PargraphNode';

// Inside the `editor.update` you can use special $ prefixed helper functions.
// These functions cannot be used outside the closure, and will error if you try.
// (If you're familiar with React, you can imagine these to be a bit like using a hook
// outside of a React function component).
editor.update(() => {
  // Get the RootNode from the EditorState
  const root = $getRoot();

  // Get the selection from the EditorState
  const selection = $getSelection();

  // Create a new ParagraphNode
  const paragraphNode = $createParagraphNode();

  // Create a new TextNode
  const textNode = $createTextNode('Hello world');

  // Append the text node to the paragraph
  paragraphNode.append(textNode);

  // Finally, append the paragraph to the root
  root.append(paragraphNode);
});
```

If you want to know when the editor updates so you can react to the changes, you can add an update
listener to the editor, as shown below:

```js
editor.registerUpdateListener(({editorState}) => {
  // The latest EditorState can be found as `editorState`.
  // To read the contents of the EditorState, use the following API:

  editorState.read(() => {
    // Just like editor.update(), .read() expects a closure where you can use
    // the $ prefixed helper functions.
  });
});
```
