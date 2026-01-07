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

var _event_utils = require("../../web/event_utils.js");
var _is_node = require("../../shared/is_node.js");
describe("event_utils", function () {
  describe("EventBus", function () {
    it("dispatch event", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      eventBus.on("test", function (evt) {
        expect(evt).toEqual(undefined);
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(1);
    });
    it("dispatch event with arguments", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      eventBus.on("test", function (evt) {
        expect(evt).toEqual({
          abc: 123
        });
        count++;
      });
      eventBus.dispatch("test", {
        abc: 123
      });
      expect(count).toEqual(1);
    });
    it("dispatch different event", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("nottest");
      expect(count).toEqual(0);
    });
    it("dispatch event multiple times", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      eventBus.dispatch("test");
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch event to multiple handlers", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      eventBus.on("test", function () {
        count++;
      });
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch to detached", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      const listener = function () {
        count++;
      };
      eventBus.on("test", listener);
      eventBus.dispatch("test");
      eventBus.off("test", listener);
      eventBus.dispatch("test");
      expect(count).toEqual(1);
    });
    it("dispatch to wrong detached", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      eventBus.off("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch to detached during handling", function () {
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      const listener1 = function () {
        eventBus.off("test", listener2);
        count++;
      };
      const listener2 = function () {
        eventBus.off("test", listener1);
        count++;
      };
      eventBus.on("test", listener1);
      eventBus.on("test", listener2);
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch event to handlers with/without 'once' option", function () {
      const eventBus = new _event_utils.EventBus();
      let multipleCount = 0,
        onceCount = 0;
      eventBus.on("test", function () {
        multipleCount++;
      });
      eventBus.on("test", function () {
        onceCount++;
      }, {
        once: true
      });
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      expect(multipleCount).toEqual(3);
      expect(onceCount).toEqual(1);
    });
    it("should not re-dispatch to DOM", async function () {
      if (_is_node.isNodeJS) {
        pending("Document is not supported in Node.js.");
      }
      const eventBus = new _event_utils.EventBus();
      let count = 0;
      eventBus.on("test", function (evt) {
        expect(evt).toEqual(undefined);
        count++;
      });
      function domEventListener() {
        expect(false).toEqual(true);
      }
      document.addEventListener("test", domEventListener);
      eventBus.dispatch("test");
      await Promise.resolve();
      expect(count).toEqual(1);
      document.removeEventListener("test", domEventListener);
    });
  });
  describe("waitOnEventOrTimeout", function () {
    let eventBus;
    beforeAll(function () {
      eventBus = new _event_utils.EventBus();
    });
    afterAll(function () {
      eventBus = null;
    });
    it("should reject invalid parameters", async function () {
      const invalidTarget = (0, _event_utils.waitOnEventOrTimeout)({
        target: "window",
        name: "DOMContentLoaded"
      }).then(function () {
        expect(false).toEqual(true);
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      const invalidName = (0, _event_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: ""
      }).then(function () {
        expect(false).toEqual(true);
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      const invalidDelay = (0, _event_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: "pagerendered",
        delay: -1000
      }).then(function () {
        expect(false).toEqual(true);
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      await Promise.all([invalidTarget, invalidName, invalidDelay]);
    });
    it("should resolve on event, using the DOM", async function () {
      if (_is_node.isNodeJS) {
        pending("Document is not supported in Node.js.");
      }
      const button = document.createElement("button");
      const buttonClicked = (0, _event_utils.waitOnEventOrTimeout)({
        target: button,
        name: "click",
        delay: 10000
      });
      button.click();
      const type = await buttonClicked;
      expect(type).toEqual(_event_utils.WaitOnType.EVENT);
    });
    it("should resolve on timeout, using the DOM", async function () {
      if (_is_node.isNodeJS) {
        pending("Document is not supported in Node.js.");
      }
      const button = document.createElement("button");
      const buttonClicked = (0, _event_utils.waitOnEventOrTimeout)({
        target: button,
        name: "click",
        delay: 10
      });
      const type = await buttonClicked;
      expect(type).toEqual(_event_utils.WaitOnType.TIMEOUT);
    });
    it("should resolve on event, using the EventBus", async function () {
      const pageRendered = (0, _event_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: "pagerendered",
        delay: 10000
      });
      eventBus.dispatch("pagerendered");
      const type = await pageRendered;
      expect(type).toEqual(_event_utils.WaitOnType.EVENT);
    });
    it("should resolve on timeout, using the EventBus", async function () {
      const pageRendered = (0, _event_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: "pagerendered",
        delay: 10
      });
      const type = await pageRendered;
      expect(type).toEqual(_event_utils.WaitOnType.TIMEOUT);
    });
  });
});