# `@lexical/list`

[![See API Documentation](https://lexical.dev/img/see-api-documentation.svg)](https://lexical.dev/docs/api/modules/lexical_list)

This package exposes the primitives for implementing lists in Lexical. If you're trying to implement conventional lists with React, take a look at the ListPlugin exposed
by [@lexical/react](https://lexical.dev/docs/packages/lexical-react), which wraps these primitives into a neat component that you can drop into any LexicalComposer.

The API of @lexical/list primarily consists of Lexical Nodes that encapsulate list behaviors and a set of functions that can be called to trigger typical list manipulation functionality:

## Functions

### $insertList

As the name suggests, this inserts a list of the provided type according to an algorithm that tries to determine the best way to do that based on
the current Selection. For instance, if some text is selected, $insertList may try to move it into the first item in the list. See the API documentation for more detail.

### $removeList

Attempts to remove lists inside the current selection based on a set of opinionated heuristics that implement conventional editor behaviors. For instance, it converts empty ListItemNodes into empty ParagraphNodes.

## Nodes

### ListNode

### ListItemNode

## Commands

For convenience, we provide a set of commands that can be used to connect a plugin to trigger typical list manipulation functionality:

### INSERT_UNORDERED_LIST_COMMAND

### INSERT_ORDERED_LIST_COMMAND

### INSERT_CHECK_LIST_COMMAND

### REMOVE_LIST_COMMAND

It's important to note that these commands don't have any functionality on their own. They are just for convenience and require you to register a handler for them in order to actually change the editor state when they are dispatched, as below:


```ts
// MyListPlugin.ts

editor.registerCommand(INSERT_UNORDERED_LIST_COMMAND, () => {
    $insertList(editor, 'bullet');
    return true;
}, COMMAND_PRIORITY_LOW);

// MyInsertListToolbarButton.ts

function onButtonClick(e: MouseEvent) {
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
}

```

## Theming

Lists can be styled using the following properties in the EditorTheme passed to the editor in the initial config (the values are classes that will be applied in the denoted contexts):

```ts
{
  list?: {
    // Applies to all lists of type "bullet"
    ul?: EditorThemeClassName;
    // Used to apply specific styling to nested levels of bullet lists
    // e.g., [ 'bullet-list-level-one', 'bullet-list-level-two' ]
    ulDepth?: Array<EditorThemeClassName>;
    // Applies to all lists of type "number"
    ol?: EditorThemeClassName;
    // Used to apply specific styling to nested levels of number lists
    // e.g., [ 'number-list-level-one', 'number-list-level-two' ]
    olDepth?: Array<EditorThemeClassName>;
    // Applies to all list items
    listitem?: EditorThemeClassName;
    // Applies to all list items with checked property set to "true"
    listitemChecked?: EditorThemeClassName;
    // Applies to all list items with checked property set to "false"
    listitemUnchecked?: EditorThemeClassName;
    // Applies only to list and list items that are not at the top level.
    nested?: {
      list?: EditorThemeClassName;
      listitem?: EditorThemeClassName;
    };
  };
}
```
