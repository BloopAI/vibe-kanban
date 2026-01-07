/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

"use strict";var e=require("react");const n=e.createContext(null);exports.LexicalComposerContext=n,exports.createLexicalComposerContext=function(e,n){let t=null;return null!=e&&(t=e[1]),{getTheme:function(){return null!=n?n:null!=t?t.getTheme():null}}},exports.useLexicalComposerContext=function(){const t=e.useContext(n);return null==t&&function(e,...n){const t=new URL("https://lexical.dev/docs/error"),r=new URLSearchParams;r.append("code",e);for(const e of n)r.append("v",e);throw t.search=r.toString(),Error(`Minified Lexical error #${e}; visit ${t.toString()} for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`)}(8),t};
