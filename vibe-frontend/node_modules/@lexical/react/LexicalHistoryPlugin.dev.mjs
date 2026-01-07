/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
export { createEmptyHistoryState } from '@lexical/history';
import { useMemo, useEffect } from 'react';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function useHistory(editor, externalHistoryState, delay = 1000) {
  const historyState = useMemo(() => externalHistoryState || createEmptyHistoryState(), [externalHistoryState]);
  useEffect(() => {
    return registerHistory(editor, historyState, delay);
  }, [delay, editor, historyState]);
}

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function HistoryPlugin({
  delay,
  externalHistoryState
}) {
  const [editor] = useLexicalComposerContext();
  useHistory(editor, externalHistoryState, delay);
  return null;
}

export { HistoryPlugin };
