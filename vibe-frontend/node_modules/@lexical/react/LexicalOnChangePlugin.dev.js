/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var lexical = require('lexical');
var react = require('react');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const CAN_USE_DOM = typeof window !== 'undefined' && typeof window.document !== 'undefined' && typeof window.document.createElement !== 'undefined';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */


// This workaround is no longer necessary in React 19,
// but we currently support React >=17.x
// https://github.com/facebook/react/pull/26395
const useLayoutEffectImpl = CAN_USE_DOM ? react.useLayoutEffect : react.useEffect;

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function OnChangePlugin({
  ignoreHistoryMergeTagChange = true,
  ignoreSelectionChange = false,
  onChange
}) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  useLayoutEffectImpl(() => {
    if (onChange) {
      return editor.registerUpdateListener(({
        editorState,
        dirtyElements,
        dirtyLeaves,
        prevEditorState,
        tags
      }) => {
        if (ignoreSelectionChange && dirtyElements.size === 0 && dirtyLeaves.size === 0 || ignoreHistoryMergeTagChange && tags.has(lexical.HISTORY_MERGE_TAG) || prevEditorState.isEmpty()) {
          return;
        }
        onChange(editorState, editor, tags);
      });
    }
  }, [editor, ignoreHistoryMergeTagChange, ignoreSelectionChange, onChange]);
  return null;
}

exports.OnChangePlugin = OnChangePlugin;
