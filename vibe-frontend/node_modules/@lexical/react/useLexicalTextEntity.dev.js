/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
var text = require('@lexical/text');
var utils = require('@lexical/utils');
var react = require('react');

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function useLexicalTextEntity(getMatch, targetNode, createNode) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  react.useEffect(() => {
    return utils.mergeRegister(...text.registerLexicalTextEntity(editor, getMatch, targetNode, createNode));
  }, [createNode, editor, getMatch, targetNode]);
}

exports.useLexicalTextEntity = useLexicalTextEntity;
