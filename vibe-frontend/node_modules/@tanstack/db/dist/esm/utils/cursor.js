import { gt, lt, eq, and, or } from "../query/builder/functions.js";
import { Value } from "../query/ir.js";
function buildCursor(orderBy, values) {
  if (values.length === 0 || orderBy.length === 0) {
    return void 0;
  }
  if (orderBy.length === 1) {
    const { expression, compareOptions } = orderBy[0];
    const operator = compareOptions.direction === `asc` ? gt : lt;
    return operator(expression, new Value(values[0]));
  }
  const clauses = [];
  for (let i = 0; i < orderBy.length && i < values.length; i++) {
    const clause = orderBy[i];
    const value = values[i];
    const eqConditions = [];
    for (let j = 0; j < i; j++) {
      const prevClause = orderBy[j];
      const prevValue = values[j];
      eqConditions.push(eq(prevClause.expression, new Value(prevValue)));
    }
    const operator = clause.compareOptions.direction === `asc` ? gt : lt;
    const comparison = operator(clause.expression, new Value(value));
    if (eqConditions.length === 0) {
      clauses.push(comparison);
    } else {
      const allConditions = [...eqConditions, comparison];
      clauses.push(allConditions.reduce((acc, cond) => and(acc, cond)));
    }
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return clauses.reduce((acc, clause) => or(acc, clause));
}
export {
  buildCursor
};
//# sourceMappingURL=cursor.js.map
