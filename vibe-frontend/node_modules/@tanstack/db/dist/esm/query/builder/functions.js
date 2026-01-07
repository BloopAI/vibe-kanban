import { Func, Aggregate } from "../ir.js";
import { toExpression } from "./ref-proxy.js";
function eq(left, right) {
  return new Func(`eq`, [toExpression(left), toExpression(right)]);
}
function gt(left, right) {
  return new Func(`gt`, [toExpression(left), toExpression(right)]);
}
function gte(left, right) {
  return new Func(`gte`, [toExpression(left), toExpression(right)]);
}
function lt(left, right) {
  return new Func(`lt`, [toExpression(left), toExpression(right)]);
}
function lte(left, right) {
  return new Func(`lte`, [toExpression(left), toExpression(right)]);
}
function and(left, right, ...rest) {
  const allArgs = [left, right, ...rest];
  return new Func(
    `and`,
    allArgs.map((arg) => toExpression(arg))
  );
}
function or(left, right, ...rest) {
  const allArgs = [left, right, ...rest];
  return new Func(
    `or`,
    allArgs.map((arg) => toExpression(arg))
  );
}
function not(value) {
  return new Func(`not`, [toExpression(value)]);
}
function isUndefined(value) {
  return new Func(`isUndefined`, [toExpression(value)]);
}
function isNull(value) {
  return new Func(`isNull`, [toExpression(value)]);
}
function inArray(value, array) {
  return new Func(`in`, [toExpression(value), toExpression(array)]);
}
function like(left, right) {
  return new Func(`like`, [toExpression(left), toExpression(right)]);
}
function ilike(left, right) {
  return new Func(`ilike`, [toExpression(left), toExpression(right)]);
}
function upper(arg) {
  return new Func(`upper`, [toExpression(arg)]);
}
function lower(arg) {
  return new Func(`lower`, [toExpression(arg)]);
}
function length(arg) {
  return new Func(`length`, [toExpression(arg)]);
}
function concat(...args) {
  return new Func(
    `concat`,
    args.map((arg) => toExpression(arg))
  );
}
function coalesce(...args) {
  return new Func(
    `coalesce`,
    args.map((arg) => toExpression(arg))
  );
}
function add(left, right) {
  return new Func(`add`, [
    toExpression(left),
    toExpression(right)
  ]);
}
function count(arg) {
  return new Aggregate(`count`, [toExpression(arg)]);
}
function avg(arg) {
  return new Aggregate(`avg`, [toExpression(arg)]);
}
function sum(arg) {
  return new Aggregate(`sum`, [toExpression(arg)]);
}
function min(arg) {
  return new Aggregate(`min`, [toExpression(arg)]);
}
function max(arg) {
  return new Aggregate(`max`, [toExpression(arg)]);
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
export {
  add,
  and,
  avg,
  coalesce,
  comparisonFunctions,
  concat,
  count,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  isUndefined,
  length,
  like,
  lower,
  lt,
  lte,
  max,
  min,
  not,
  operators,
  or,
  sum,
  upper
};
//# sourceMappingURL=functions.js.map
