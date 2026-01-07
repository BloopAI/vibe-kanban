"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenChatButton = void 0;
var jsx_runtime_1 = require("preact/jsx-runtime");
var styles_1 = require("./styles");
var OpenChatButton = function (_a) {
    var primaryColor = _a.primaryColor, handleToggleOpen = _a.handleToggleOpen, _b = _a.unreadCount, unreadCount = _b === void 0 ? 0 : _b;
    var styles = (0, styles_1.getStyles)(primaryColor);
    var displayCount = unreadCount > 99 ? '99+' : unreadCount.toString();
    return ((0, jsx_runtime_1.jsx)("div", { style: styles.widget, children: (0, jsx_runtime_1.jsxs)("div", { style: styles.buttonContainer, children: [(0, jsx_runtime_1.jsx)("button", { style: styles.button, onClick: handleToggleOpen, "aria-label": unreadCount > 0 ? "Open chat (".concat(unreadCount, " unread)") : 'Open chat', onMouseEnter: function (e) {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)';
                    }, onMouseLeave: function (e) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                    }, children: (0, jsx_runtime_1.jsx)("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: (0, jsx_runtime_1.jsx)("path", { d: "M12 2C6.48 2 2 6.48 2 12C2 13.93 2.6 15.71 3.64 17.18L2.5 21.5L7.04 20.42C8.46 21.28 10.17 21.75 12 21.75C17.52 21.75 22 17.27 22 11.75C22 6.23 17.52 2 12 2Z", fill: "currentColor" }) }) }), unreadCount > 0 && (0, jsx_runtime_1.jsx)("div", { style: styles.unreadBadge, children: displayCount })] }) }));
};
exports.OpenChatButton = OpenChatButton;
//# sourceMappingURL=OpenChatButton.js.map