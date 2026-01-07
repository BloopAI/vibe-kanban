/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var markdown = require('@lexical/markdown');
var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var LexicalHorizontalRuleNode = require('@lexical/react/LexicalHorizontalRuleNode');
var react = require('react');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const HR = {
  dependencies: [LexicalHorizontalRuleNode.HorizontalRuleNode],
  export: node => {
    return LexicalHorizontalRuleNode.$isHorizontalRuleNode(node) ? '***' : null;
  },
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _1, _2, isImport) => {
    const line = LexicalHorizontalRuleNode.$createHorizontalRuleNode();

    // TODO: Get rid of isImport flag
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line);
    } else {
      parentNode.insertBefore(line);
    }
    line.selectNext();
  },
  type: 'element'
};
const DEFAULT_TRANSFORMERS = [HR, ...markdown.TRANSFORMERS];
function MarkdownShortcutPlugin({
  transformers = DEFAULT_TRANSFORMERS
}) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  react.useEffect(() => {
    return markdown.registerMarkdownShortcuts(editor, transformers);
  }, [editor, transformers]);
  return null;
}

exports.DEFAULT_TRANSFORMERS = DEFAULT_TRANSFORMERS;
exports.MarkdownShortcutPlugin = MarkdownShortcutPlugin;
