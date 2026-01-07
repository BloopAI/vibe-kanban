/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_HORIZONTAL_RULE_COMMAND, $createHorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR } from 'lexical';
import { useEffect } from 'react';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function HorizontalRulePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(INSERT_HORIZONTAL_RULE_COMMAND, type => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return false;
      }
      const focusNode = selection.focus.getNode();
      if (focusNode !== null) {
        const horizontalRuleNode = $createHorizontalRuleNode();
        $insertNodeToNearestRoot(horizontalRuleNode);
      }
      return true;
    }, COMMAND_PRIORITY_EDITOR);
  }, [editor]);
  return null;
}

export { HorizontalRulePlugin };
