/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

"use strict";var e=require("@lexical/extension"),t=require("lexical");function n(e){const n=window.location.origin,o=o=>{if(o.origin!==n)return;const i=e.getRootElement();if(document.activeElement!==i)return;const s=o.data;if("string"==typeof s){let n;try{n=JSON.parse(s)}catch(e){return}if(n&&"nuanria_messaging"===n.protocol&&"request"===n.type){const i=n.payload;if(i&&"makeChanges"===i.functionId){const n=i.args;if(n){const[i,s,a,r,d]=n;e.update(()=>{const e=t.$getSelection();if(t.$isRangeSelection(e)){const n=e.anchor;let c=n.getNode(),g=0,l=0;if(t.$isTextNode(c)&&i>=0&&s>=0&&(g=i,l=i+s,e.setTextNodeRange(c,g,c,l)),g===l&&""===a||(e.insertRawText(a),c=n.getNode()),t.$isTextNode(c)){g=r,l=r+d;const t=c.getTextContentSize();g=g>t?t:g,l=l>t?t:l,e.setTextNodeRange(c,g,c,l)}o.stopImmediatePropagation()}})}}}}};return window.addEventListener("message",o,!0),()=>{window.removeEventListener("message",o,!0)}}const o=t.defineExtension({build:(t,n,o)=>e.namedSignals(n),config:t.safeCast({disabled:"undefined"==typeof window}),name:"@lexical/dragon",register:(t,o,i)=>e.effect(()=>i.getOutput().disabled.value?void 0:n(t))});exports.DragonExtension=o,exports.registerDragonSupport=n;
