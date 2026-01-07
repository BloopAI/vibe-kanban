/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import{createContext as n,useContext as e}from"react";const r=n(null);function t(n,e){let r=null;return null!=n&&(r=n[1]),{getTheme:function(){return null!=e?e:null!=r?r.getTheme():null}}}function o(){const n=e(r);return null==n&&function(n,...e){const r=new URL("https://lexical.dev/docs/error"),t=new URLSearchParams;t.append("code",n);for(const n of e)t.append("v",n);throw r.search=t.toString(),Error(`Minified Lexical error #${n}; visit ${r.toString()} for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`)}(8),n}export{r as LexicalComposerContext,t as createLexicalComposerContext,o as useLexicalComposerContext};
