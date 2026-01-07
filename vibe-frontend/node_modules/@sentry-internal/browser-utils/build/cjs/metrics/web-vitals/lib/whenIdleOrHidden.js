Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const types = require('../../../types.js');
const onHidden = require('./onHidden.js');
const runOnce = require('./runOnce.js');

/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * Runs the passed callback during the next idle period, or immediately
 * if the browser's visibility state is (or becomes) hidden.
 */
const whenIdleOrHidden = (cb) => {
  const rIC = types.WINDOW.requestIdleCallback || types.WINDOW.setTimeout;

  // If the document is hidden, run the callback immediately, otherwise
  // race an idle callback with the next `visibilitychange` event.
  if (types.WINDOW.document?.visibilityState === 'hidden') {
    cb();
  } else {
    // eslint-disable-next-line no-param-reassign
    cb = runOnce.runOnce(cb);
    rIC(cb);
    // sentry: we use onHidden instead of directly listening to visibilitychange
    // because some browsers we still support (Safari <14.4) don't fully support
    // `visibilitychange` or have known bugs w.r.t the `visibilitychange` event.
    onHidden.onHidden(cb);
  }
};

exports.whenIdleOrHidden = whenIdleOrHidden;
//# sourceMappingURL=whenIdleOrHidden.js.map
