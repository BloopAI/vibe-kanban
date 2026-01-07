/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalYjs = process.env.NODE_ENV !== 'production' ? require('./LexicalYjs.dev.js') : require('./LexicalYjs.prod.js');
module.exports = LexicalYjs;