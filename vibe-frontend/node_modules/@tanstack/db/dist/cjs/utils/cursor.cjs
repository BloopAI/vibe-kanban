"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const functions = require("../query/builder/functions.cjs");
const ir = require("../query/ir.cjs");
function buildCursor(orderBy, values) {
  if (values.length === 0 || orderBy.length === 0) {
    return void 0;
  }
  if (orderBy.length === 1) {
    const { expression, compareOptions } = orderBy[0];
    const operator = compareOptions.direction === `asc` ? functions.gt : functions.lt;
    return operator(expression, new ir.Value(values[0]));
  }
  const clauses = [];
  for (let i = 0; i < orderBy.length && i < values.length; i++) {
    const clause = orderBy[i];
    const value = values[i];
    const eqConditions = [];
    for (let j = 0; j < i; j++) {
      const prevClause = orderBy[j];
      const prevValue = values[j];
      eqConditions.push(functions.eq(prevClause.expression, new ir.Value(prevValue)));
    }
    const operator = clause.compareOptions.direction === `asc` ? functions.gt : functions.lt;
    const comparison = operator(clause.expression, new ir.Value(value));
    if (eqConditions.length === 0) {
      clauses.push(comparison);
    } else {
      const allConditions = [...eqConditions, comparison];
      clauses.push(allConditions.reduce((acc, cond) => functions.and(acc, cond)));
    }
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return clauses.reduce((acc, clause) => functions.or(acc, clause));
}
exports.buildCursor = buildCursor;
//# sourceMappingURL=cursor.cjs.map
