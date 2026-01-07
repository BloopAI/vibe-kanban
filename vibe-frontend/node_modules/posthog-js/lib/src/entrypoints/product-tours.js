"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var product_tours_1 = require("../extensions/product-tours");
var globals_1 = require("../utils/globals");
globals_1.assignableWindow.__PosthogExtensions__ = globals_1.assignableWindow.__PosthogExtensions__ || {};
globals_1.assignableWindow.__PosthogExtensions__.generateProductTours = product_tours_1.generateProductTours;
exports.default = product_tours_1.generateProductTours;
//# sourceMappingURL=product-tours.js.map