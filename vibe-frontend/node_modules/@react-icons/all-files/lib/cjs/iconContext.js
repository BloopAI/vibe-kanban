"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IconContext = exports.DefaultContext = void 0;
var React = require("react");
exports.DefaultContext = {
    color: undefined,
    size: undefined,
    className: undefined,
    style: undefined,
    attr: undefined,
};
exports.IconContext = React.createContext && React.createContext(exports.DefaultContext);
