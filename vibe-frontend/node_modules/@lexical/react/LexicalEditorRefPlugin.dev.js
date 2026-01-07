/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var React = require('react');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    for (var k in e) {
      n[k] = e[k];
    }
  }
  n.default = e;
  return n;
}

var React__namespace = /*#__PURE__*/_interopNamespaceDefault(React);

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */


/**
 *
 * Use this plugin to access the editor instance outside of the
 * LexicalComposer. This can help with things like buttons or other
 * UI components that need to update or read EditorState but need to
 * be positioned outside the LexicalComposer in the React tree.
 */
function EditorRefPlugin({
  editorRef
}) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  React__namespace.useEffect(() => {
    if (typeof editorRef === 'function') {
      editorRef(editor);
    } else if (typeof editorRef === 'object') {
      editorRef.current = editor;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  return null;
}

exports.EditorRefPlugin = EditorRefPlugin;
