/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var LexicalHorizontalRuleNode = require('@lexical/react/LexicalHorizontalRuleNode');
var utils = require('@lexical/utils');
var lexical = require('lexical');
var react = require('react');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function HorizontalRulePlugin() {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  react.useEffect(() => {
    return editor.registerCommand(LexicalHorizontalRuleNode.INSERT_HORIZONTAL_RULE_COMMAND, type => {
      const selection = lexical.$getSelection();
      if (!lexical.$isRangeSelection(selection)) {
        return false;
      }
      const focusNode = selection.focus.getNode();
      if (focusNode !== null) {
        const horizontalRuleNode = LexicalHorizontalRuleNode.$createHorizontalRuleNode();
        utils.$insertNodeToNearestRoot(horizontalRuleNode);
      }
      return true;
    }, lexical.COMMAND_PRIORITY_EDITOR);
  }, [editor]);
  return null;
}

exports.HorizontalRulePlugin = HorizontalRulePlugin;
