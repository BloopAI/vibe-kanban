/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { createLexicalComposerContext, LexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { createEditor, $getRoot, $createParagraphNode, $getSelection, HISTORY_MERGE_TAG } from 'lexical';
import { useLayoutEffect, useEffect, useMemo } from 'react';
import { jsx } from 'react/jsx-runtime';

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
const useLayoutEffectImpl = CAN_USE_DOM ? useLayoutEffect : useEffect;

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const HISTORY_MERGE_OPTIONS = {
  tag: HISTORY_MERGE_TAG
};
function LexicalComposer({
  initialConfig,
  children
}) {
  const composerContext = useMemo(() => {
    const {
      theme,
      namespace,
      nodes,
      onError,
      editorState: initialEditorState,
      html
    } = initialConfig;
    const context = createLexicalComposerContext(null, theme);
    const editor = createEditor({
      editable: initialConfig.editable,
      html,
      namespace,
      nodes,
      onError: error => onError(error, editor),
      theme
    });
    initializeEditor(editor, initialEditorState);
    return [editor, context];
  },
  // We only do this for init
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);
  useLayoutEffectImpl(() => {
    const isEditable = initialConfig.editable;
    const [editor] = composerContext;
    editor.setEditable(isEditable !== undefined ? isEditable : true);

    // We only do this for init
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return /*#__PURE__*/jsx(LexicalComposerContext.Provider, {
    value: composerContext,
    children: children
  });
}
function initializeEditor(editor, initialEditorState) {
  if (initialEditorState === null) {
    return;
  } else if (initialEditorState === undefined) {
    editor.update(() => {
      const root = $getRoot();
      if (root.isEmpty()) {
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        const activeElement = CAN_USE_DOM ? document.activeElement : null;
        if ($getSelection() !== null || activeElement !== null && activeElement === editor.getRootElement()) {
          paragraph.select();
        }
      }
    }, HISTORY_MERGE_OPTIONS);
  } else if (initialEditorState !== null) {
    switch (typeof initialEditorState) {
      case 'string':
        {
          const parsedEditorState = editor.parseEditorState(initialEditorState);
          editor.setEditorState(parsedEditorState, HISTORY_MERGE_OPTIONS);
          break;
        }
      case 'object':
        {
          editor.setEditorState(initialEditorState, HISTORY_MERGE_OPTIONS);
          break;
        }
      case 'function':
        {
          editor.update(() => {
            const root = $getRoot();
            if (root.isEmpty()) {
              initialEditorState(editor);
            }
          }, HISTORY_MERGE_OPTIONS);
          break;
        }
    }
  }
}

export { LexicalComposer };
