/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import{effect as e,namedSignals as t}from"@lexical/extension";import{defineExtension as n,safeCast as o,$getSelection as i,$isRangeSelection as a,$isTextNode as r}from"lexical";function s(e){const t=window.location.origin,n=n=>{if(n.origin!==t)return;const o=e.getRootElement();if(document.activeElement!==o)return;const s=n.data;if("string"==typeof s){let t;try{t=JSON.parse(s)}catch(e){return}if(t&&"nuanria_messaging"===t.protocol&&"request"===t.type){const o=t.payload;if(o&&"makeChanges"===o.functionId){const t=o.args;if(t){const[o,s,d,c,g]=t;e.update(()=>{const e=i();if(a(e)){const t=e.anchor;let i=t.getNode(),a=0,l=0;if(r(i)&&o>=0&&s>=0&&(a=o,l=o+s,e.setTextNodeRange(i,a,i,l)),a===l&&""===d||(e.insertRawText(d),i=t.getNode()),r(i)){a=c,l=c+g;const t=i.getTextContentSize();a=a>t?t:a,l=l>t?t:l,e.setTextNodeRange(i,a,i,l)}n.stopImmediatePropagation()}})}}}}};return window.addEventListener("message",n,!0),()=>{window.removeEventListener("message",n,!0)}}const d=n({build:(e,n,o)=>t(n),config:o({disabled:"undefined"==typeof window}),name:"@lexical/dragon",register:(t,n,o)=>e(()=>o.getOutput().disabled.value?void 0:s(t))});export{d as DragonExtension,s as registerDragonSupport};
