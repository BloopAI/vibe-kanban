/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const useLexicalIsTextContentEmpty = process.env.NODE_ENV !== 'production' ? require('./useLexicalIsTextContentEmpty.dev.js') : require('./useLexicalIsTextContentEmpty.prod.js');
module.exports = useLexicalIsTextContentEmpty;