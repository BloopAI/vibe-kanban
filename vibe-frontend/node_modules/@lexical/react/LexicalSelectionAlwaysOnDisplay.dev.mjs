/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { selectionAlwaysOnDisplay } from '@lexical/utils';
import { useEffect } from 'react';

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function SelectionAlwaysOnDisplay() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return selectionAlwaysOnDisplay(editor);
  }, [editor]);
  return null;
}

export { SelectionAlwaysOnDisplay };
