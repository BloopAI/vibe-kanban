/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalOverflow = process.env.NODE_ENV !== 'production' ? require('./LexicalOverflow.dev.js') : require('./LexicalOverflow.prod.js');
module.exports = LexicalOverflow;