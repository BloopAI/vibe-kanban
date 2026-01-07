/**
 * @licstart The following is the entire license notice for the
 * JavaScript code in this page
 *
 * Copyright 2023 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * JavaScript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TestReporter = void 0;
const TestReporter = function (browser) {
  function send(action, json) {
    return new Promise(resolve => {
      json.browser = browser;
      fetch(action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(json)
      }).then(response => {
        if (!response.ok || response.status !== 200) {
          throw new Error(response.statusText);
        }
        resolve();
      }).catch(reason => {
        console.warn(`TestReporter - send failed (${action}): ${reason}`);
        resolve();
        send(action, json);
      });
    });
  }
  function sendInfo(message) {
    send("/info", {
      message
    });
  }
  function sendResult(status, description, error) {
    const message = {
      status,
      description
    };
    if (error !== undefined) {
      message.error = error;
    }
    send("/submit_task_results", message);
  }
  function sendQuitRequest() {
    send(`/tellMeToQuit?browser=${escape(browser)}`, {});
  }
  this.now = function () {
    return Date.now();
  };
  this.jasmineStarted = function (suiteInfo) {
    this.runnerStartTime = this.now();
    const total = suiteInfo.totalSpecsDefined;
    const seed = suiteInfo.order.seed;
    sendInfo(`Started ${total} tests for ${browser} with seed ${seed}.`);
  };
  this.suiteStarted = function (result) {
    if (result.failedExpectations.length > 0) {
      let failedMessages = "";
      for (const item of result.failedExpectations) {
        failedMessages += `${item.message} `;
      }
      sendResult("TEST-UNEXPECTED-FAIL", result.description, failedMessages);
    }
  };
  this.specStarted = function (result) {};
  this.specDone = function (result) {
    if (result.failedExpectations.length === 0) {
      sendResult("TEST-PASSED", result.description);
    } else {
      let failedMessages = "";
      for (const item of result.failedExpectations) {
        failedMessages += `${item.message} `;
      }
      sendResult("TEST-UNEXPECTED-FAIL", result.description, failedMessages);
    }
  };
  this.suiteDone = function (result) {};
  this.jasmineDone = function () {
    setTimeout(sendQuitRequest, 500);
  };
};
exports.TestReporter = TestReporter;