"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendMessageButton = void 0;
var jsx_runtime_1 = require("preact/jsx-runtime");
var styles_1 = require("./styles");
var SendMessageButton = function (_a) {
    var primaryColor = _a.primaryColor, inputValue = _a.inputValue, isLoading = _a.isLoading, handleSendMessage = _a.handleSendMessage;
    var styles = (0, styles_1.getStyles)(primaryColor);
    return ((0, jsx_runtime_1.jsx)("button", { style: __assign(__assign({}, styles.sendButton), { opacity: !inputValue.trim() || isLoading ? 0.6 : 1, cursor: !inputValue.trim() || isLoading ? 'not-allowed' : 'pointer' }), onClick: handleSendMessage, disabled: !inputValue.trim() || isLoading, "aria-label": "Send message", onMouseEnter: function (e) {
            if (!e.currentTarget.disabled) {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
            }
        }, onMouseLeave: function (e) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.045)';
        }, children: (0, jsx_runtime_1.jsx)("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: (0, jsx_runtime_1.jsx)("path", { d: "M2 10L18 2L10 18L8 11L2 10Z", fill: "currentColor", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round" }) }) }));
};
exports.SendMessageButton = SendMessageButton;
//# sourceMappingURL=SendMessageButton.js.map