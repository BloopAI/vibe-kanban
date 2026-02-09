import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  KEY_MODIFIER_COMMAND,
  KEY_ENTER_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  COMMAND_PRIORITY_HIGH,
  type LexicalNode,
} from 'lexical';
import { $convertToMarkdownString, type Transformer } from '@lexical/markdown';
import { $isListItemNode } from '@lexical/list';
import type { SendMessageShortcut } from 'shared/types';
import { useTypeaheadOpen } from '@/components/ui/wysiwyg/context/typeahead-open-context';

const DEBUG_PREFIX = '[WYSIWYG_DEBUG]';

function debugLog(message: string, payload?: unknown) {
  if (!import.meta.env.DEV) return;
  if (payload === undefined) {
    console.log(DEBUG_PREFIX, message);
    return;
  }
  console.log(DEBUG_PREFIX, message, payload);
}

type Props = {
  onCmdEnter?: () => void;
  onShiftCmdEnter?: () => void;
  onChange?: (markdown: string) => void;
  transformers?: Transformer[];
  sendShortcut?: SendMessageShortcut;
};

export function KeyboardCommandsPlugin({
  onCmdEnter,
  onShiftCmdEnter,
  onChange,
  transformers,
  sendShortcut = 'ModifierEnter',
}: Props) {
  const [editor] = useLexicalComposerContext();
  const { isOpen: isTypeaheadOpen } = useTypeaheadOpen();

  useEffect(() => {
    const getSelectionDebug = () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return { selectionType: 'non-range' };
      }

      const anchorNode = selection.anchor.getNode();
      const focusNode = selection.focus.getNode();

      return {
        selectionType: 'range',
        isCollapsed: selection.isCollapsed(),
        anchor: {
          key: selection.anchor.key,
          offset: selection.anchor.offset,
          type: selection.anchor.type,
          nodeType: anchorNode.getType(),
          textPreview: anchorNode.getTextContent().slice(0, 80),
        },
        focus: {
          key: selection.focus.key,
          offset: selection.focus.offset,
          type: selection.focus.type,
          nodeType: focusNode.getType(),
          textPreview: focusNode.getTextContent().slice(0, 80),
        },
        nodes: selection.getNodes().map((node) => ({
          key: node.getKey(),
          type: node.getType(),
          textPreview: node.getTextContent().slice(0, 60),
        })),
      };
    };

    const isNodeInsideListItem = (node: LexicalNode): boolean => {
      if ($isListItemNode(node)) {
        return true;
      }
      return node.getParents().some($isListItemNode);
    };

    const isSelectionInsideListItem = (): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return false;
      }

      return (
        isNodeInsideListItem(selection.anchor.getNode()) ||
        isNodeInsideListItem(selection.focus.getNode())
      );
    };

    const getSelectedListItem = (): LexicalNode | null => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return null;
      }

      // On empty list items Lexical can include adjacent nodes in getNodes().
      // Prefer the last node so Tab applies to the cursor list item.
      const nodes = selection.getNodes();
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if ($isListItemNode(node)) {
          return node;
        }
        const parentListItem = node.getParents().find($isListItemNode);
        if (parentListItem) {
          return parentListItem;
        }
      }

      const anchorNode = selection.anchor.getNode();
      if ($isListItemNode(anchorNode)) {
        return anchorNode;
      }
      return anchorNode.getParents().find($isListItemNode) ?? null;
    };

    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        debugLog('tab: command received', {
          shiftKey: event.shiftKey,
          isTypeaheadOpen,
          selection: getSelectionDebug(),
        });

        // Let typeahead use Tab for option selection.
        if (isTypeaheadOpen) {
          debugLog('tab: skipped because typeahead is open');
          return false;
        }

        if (!isSelectionInsideListItem()) {
          debugLog('tab: skipped because selection is not in a list item');
          return false;
        }

        event.preventDefault();
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          debugLog('tab: no-op because selection is not a range selection');
          return false;
        }

        if (!selection.isCollapsed()) {
          const handled = editor.dispatchCommand(
            event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
            undefined
          );
          debugLog('tab: handled multi-node selection via indent command', {
            command: event.shiftKey ? 'OUTDENT_CONTENT_COMMAND' : 'INDENT_CONTENT_COMMAND',
            handled,
          });
          return handled;
        }

        const listItem = getSelectedListItem();
        if (!$isListItemNode(listItem)) {
          debugLog('tab: no-op because list item could not be resolved', {
            selection: getSelectionDebug(),
          });
          return false;
        }

        if (event.shiftKey) {
          const beforeIndent = listItem.getIndent();
          if (beforeIndent > 0) {
            listItem.setIndent(beforeIndent - 1);
          }
          debugLog('tab: outdented list item', {
            listItemKey: listItem.getKey(),
            beforeIndent,
            afterIndent: listItem.getIndent(),
          });
          return true;
        }

        // Match Google Docs behavior: first sibling cannot be indented further.
        if (!$isListItemNode(listItem.getPreviousSibling())) {
          debugLog('tab: skipped indent because no previous list-item sibling', {
            listItemKey: listItem.getKey(),
          });
          return true;
        }

        const beforeIndent = listItem.getIndent();
        listItem.setIndent(beforeIndent + 1);
        debugLog('tab: indented list item', {
          listItemKey: listItem.getKey(),
          beforeIndent,
          afterIndent: listItem.getIndent(),
        });
        return true;
      },
      COMMAND_PRIORITY_NORMAL
    );

    if (!onCmdEnter && !onShiftCmdEnter) {
      return unregisterTab;
    }

    const flushAndSubmit = () => {
      if (onChange && transformers) {
        const markdown = editor
          .getEditorState()
          .read(() => $convertToMarkdownString(transformers));
        flushSync(() => {
          onChange(markdown);
        });
      }
      onCmdEnter?.();
    };

    const unregisterModifier = editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event: KeyboardEvent) => {
        if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey && onShiftCmdEnter) {
          onShiftCmdEnter();
          return true;
        }

        if (!event.shiftKey && onCmdEnter && sendShortcut === 'ModifierEnter') {
          flushAndSubmit();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );

    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;

        // If typeahead is open, let it handle Enter
        if (isTypeaheadOpen) {
          return false;
        }

        if (sendShortcut === 'Enter') {
          if (event.shiftKey || event.metaKey || event.ctrlKey) {
            return false;
          }
          event.preventDefault();
          flushAndSubmit();
          return true;
        }

        if (event.metaKey || event.ctrlKey) {
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      unregisterTab();
      unregisterModifier();
      unregisterEnter();
    };
  }, [
    editor,
    onCmdEnter,
    onShiftCmdEnter,
    onChange,
    transformers,
    sendShortcut,
    isTypeaheadOpen,
  ]);

  return null;
}
