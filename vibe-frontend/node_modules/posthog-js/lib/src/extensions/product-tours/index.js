"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductTourStylesheet = exports.getElementMetadata = exports.findElementBySelector = exports.ProductTourManager = void 0;
exports.generateProductTours = generateProductTours;
var globals_1 = require("../../utils/globals");
var product_tours_1 = require("./product-tours");
var product_tours_2 = require("./product-tours");
Object.defineProperty(exports, "ProductTourManager", { enumerable: true, get: function () { return product_tours_2.ProductTourManager; } });
var product_tours_utils_1 = require("./product-tours-utils");
Object.defineProperty(exports, "findElementBySelector", { enumerable: true, get: function () { return product_tours_utils_1.findElementBySelector; } });
Object.defineProperty(exports, "getElementMetadata", { enumerable: true, get: function () { return product_tours_utils_1.getElementMetadata; } });
Object.defineProperty(exports, "getProductTourStylesheet", { enumerable: true, get: function () { return product_tours_utils_1.getProductTourStylesheet; } });
function generateProductTours(posthog, isEnabled) {
    if (!globals_1.document) {
        return;
    }
    var manager = new product_tours_1.ProductTourManager(posthog);
    if (isEnabled) {
        manager.start();
    }
    return manager;
}
//# sourceMappingURL=index.js.map