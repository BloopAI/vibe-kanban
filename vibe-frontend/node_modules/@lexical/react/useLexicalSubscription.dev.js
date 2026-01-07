/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

var LexicalComposerContext = require('@lexical/react/LexicalComposerContext');
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

/**
 * Shortcut to Lexical subscriptions when values are used for render.
 * @param subscription - The function to create the {@link LexicalSubscription}. This function's identity must be stable (e.g. defined at module scope or with useCallback).
 */
function useLexicalSubscription(subscription) {
  const [editor] = LexicalComposerContext.useLexicalComposerContext();
  const initializedSubscription = react.useMemo(() => subscription(editor), [editor, subscription]);
  const [value, setValue] = react.useState(() => initializedSubscription.initialValueFn());
  const valueRef = react.useRef(value);
  useLayoutEffectImpl(() => {
    const {
      initialValueFn,
      subscribe
    } = initializedSubscription;
    const currentValue = initialValueFn();
    if (valueRef.current !== currentValue) {
      valueRef.current = currentValue;
      setValue(currentValue);
    }
    return subscribe(newValue => {
      valueRef.current = newValue;
      setValue(newValue);
    });
  }, [initializedSubscription, subscription]);
  return value;
}

exports.useLexicalSubscription = useLexicalSubscription;
