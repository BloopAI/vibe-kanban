"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eachYearOfInterval = eachYearOfInterval;
const index_js_1 = require("../utils/index.js");
/**
 * Returns the start of each Ethiopic year included in the given interval.
 *
 * @param interval The interval whose years should be returned.
 */
function eachYearOfInterval(interval) {
    const start = (0, index_js_1.toEthiopicDate)(new Date(interval.start));
    const end = (0, index_js_1.toEthiopicDate)(new Date(interval.end));
    if (end.year < start.year) {
        return [];
    }
    const years = [];
    for (let year = start.year; year <= end.year; year += 1) {
        years.push((0, index_js_1.toGregorianDate)({ year, month: 1, day: 1 }));
    }
    return years;
}
