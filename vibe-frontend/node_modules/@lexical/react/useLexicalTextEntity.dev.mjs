/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { registerLexicalTextEntity } from '@lexical/text';
import { mergeRegister } from '@lexical/utils';
import { useEffect } from 'react';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function useLexicalTextEntity(getMatch, targetNode, createNode) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return mergeRegister(...registerLexicalTextEntity(editor, getMatch, targetNode, createNode));
  }, [createNode, editor, getMatch, targetNode]);
}

export { useLexicalTextEntity };
