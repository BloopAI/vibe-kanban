/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var history = require('@lexical/history');
var react = require('react');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function useHistory(editor, externalHistoryState, delay = 1000) {
  const historyState = react.useMemo(() => externalHistoryState || history.createEmptyHistoryState(), [externalHistoryState]);
  react.useEffect(() => {
    return history.registerHistory(editor, historyState, delay);
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
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  useHistory(editor, externalHistoryState, delay);
  return null;
}

exports.createEmptyHistoryState = history.createEmptyHistoryState;
exports.HistoryPlugin = HistoryPlugin;
