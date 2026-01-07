"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloseChatButton = void 0;
var jsx_runtime_1 = require("preact/jsx-runtime");
var styles_1 = require("./styles");
var CloseChatButton = function (_a) {
    var primaryColor = _a.primaryColor, handleClose = _a.handleClose;
    var styles = (0, styles_1.getStyles)(primaryColor);
    return ((0, jsx_runtime_1.jsx)("button", { style: styles.headerButton, onClick: handleClose, "aria-label": "Close", onMouseEnter: function (e) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.opacity = '1';
        }, onMouseLeave: function (e) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.opacity = '0.9';
        }, children: "\u2715" }));
};
exports.CloseChatButton = CloseChatButton;
//# sourceMappingURL=CloseChatButton.js.map