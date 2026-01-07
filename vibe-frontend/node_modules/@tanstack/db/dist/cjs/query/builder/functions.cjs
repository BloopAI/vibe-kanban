"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const ir = require("../ir.cjs");
const refProxy = require("./ref-proxy.cjs");
function eq(left, right) {
  return new ir.Func(`eq`, [refProxy.toExpression(left), refProxy.toExpression(right)]);
}
function gt(left, right) {
  return new ir.Func(`gt`, [refProxy.toExpression(left), refProxy.toExpression(right)]);
}
function gte(left, right) {
  return new ir.Func(`gte`, [refProxy.toExpression(left), refProxy.toExpression(right)]);
}
function lt(left, right) {
  return new ir.Func(`lt`, [refProxy.toExpression(left), refProxy.toExpression(right)]);
}
function lte(left, right) {
  return new ir.Func(`lte`, [refProxy.toExpression(left), refProxy.toExpression(right)]);
}
function and(left, right, ...rest) {
  const allArgs = [left, right, ...rest];
  return new ir.Func(
    `and`,
    allArgs.map((arg) => refProxy.toExpression(arg))
  );
}
function or(left, right, ...rest) {
  const allArgs = [left, right, ...rest];
  return new ir.Func(
    `or`,
    allArgs.map((arg) => refProxy.toExpression(arg))
  );
}
function not(value) {
  return new ir.Func(`not`, [refProxy.toExpression(value)]);
}
function isUndefined(value) {
  return new ir.Func(`isUndefined`, [refProxy.toExpression(value)]);
}
function isNull(value) {
  return new ir.Func(`isNull`, [refProxy.toExpression(value)]);
}
function inArray(value, array) {
  return new ir.Func(`in`, [refProxy.toExpression(value), refProxy.toExpression(array)]);
}
function like(left, right) {
  return new ir.Func(`like`, [refProxy.toExpression(left), refProxy.toExpression(right)]);
}
function ilike(left, right) {
  return new ir.Func(`ilike`, [refProxy.toExpression(left), refProxy.toExpression(right)]);
}
function upper(arg) {
  return new ir.Func(`upper`, [refProxy.toExpression(arg)]);
}
function lower(arg) {
  return new ir.Func(`lower`, [refProxy.toExpression(arg)]);
}
function length(arg) {
  return new ir.Func(`length`, [refProxy.toExpression(arg)]);
}
function concat(...args) {
  return new ir.Func(
    `concat`,
    args.map((arg) => refProxy.toExpression(arg))
  );
}
function coalesce(...args) {
  return new ir.Func(
    `coalesce`,
    args.map((arg) => refProxy.toExpression(arg))
  );
}
function add(left, right) {
  return new ir.Func(`add`, [
    refProxy.toExpression(left),
    refProxy.toExpression(right)
  ]);
}
function count(arg) {
  return new ir.Aggregate(`count`, [refProxy.toExpression(arg)]);
}
function avg(arg) {
  return new ir.Aggregate(`avg`, [refProxy.toExpression(arg)]);
}
function sum(arg) {
  return new ir.Aggregate(`sum`, [refProxy.toExpression(arg)]);
}
function min(arg) {
  return new ir.Aggregate(`min`, [refProxy.toExpression(arg)]);
}
function max(arg) {
  return new ir.Aggregate(`max`, [refProxy.toExpression(arg)]);
}
const comparisonFunctions = [
  `eq`,
  `gt`,
  `gte`,
  `lt`,
  `lte`,
  `in`,
  `like`,
  `ilike`
];
const operators = [
  // Comparison operators
  `eq`,
  `gt`,
  `gte`,
  `lt`,
  `lte`,
  `in`,
  `like`,
  `ilike`,
  // Logical operators
  `and`,
  `or`,
  `not`,
  // Null checking
  `isNull`,
  `isUndefined`,
  // String functions
  `upper`,
  `lower`,
  `length`,
  `concat`,
  // Numeric functions
  `add`,
  // Utility functions
  `coalesce`,
  // Aggregate functions
  `count`,
  `avg`,
  `sum`,
  `min`,
  `max`
];
exports.add = add;
exports.and = and;
exports.avg = avg;
exports.coalesce = coalesce;
exports.comparisonFunctions = comparisonFunctions;
exports.concat = concat;
exports.count = count;
exports.eq = eq;
exports.gt = gt;
exports.gte = gte;
exports.ilike = ilike;
exports.inArray = inArray;
exports.isNull = isNull;
exports.isUndefined = isUndefined;
exports.length = length;
exports.like = like;
exports.lower = lower;
exports.lt = lt;
exports.lte = lte;
exports.max = max;
exports.min = min;
exports.not = not;
exports.operators = operators;
exports.or = or;
exports.sum = sum;
exports.upper = upper;
//# sourceMappingURL=functions.cjs.map
