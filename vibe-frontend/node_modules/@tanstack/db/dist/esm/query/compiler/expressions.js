import { Value, PropRef, Func } from "../ir.js";
function normalizeExpressionPaths(whereClause, collectionAlias) {
  const tpe = whereClause.type;
  if (tpe === `val`) {
    return new Value(whereClause.value);
  } else if (tpe === `ref`) {
    const path = whereClause.path;
    if (Array.isArray(path)) {
      if (path[0] === collectionAlias && path.length > 1) {
        return new PropRef(path.slice(1));
      } else if (path.length === 1 && path[0] !== void 0) {
        return new PropRef([path[0]]);
      }
    }
    return new PropRef(Array.isArray(path) ? path : [String(path)]);
  } else {
    const args = [];
    for (const arg of whereClause.args) {
      const convertedArg = normalizeExpressionPaths(
        arg,
        collectionAlias
      );
      args.push(convertedArg);
    }
    return new Func(whereClause.name, args);
  }
}
function normalizeOrderByPaths(orderBy, collectionAlias) {
  const normalizedOrderBy = orderBy.map((clause) => {
    const basicExp = normalizeExpressionPaths(
      clause.expression,
      collectionAlias
    );
    return {
      ...clause,
      expression: basicExp
    };
  });
  return normalizedOrderBy;
}
export {
  normalizeExpressionPaths,
  normalizeOrderByPaths
};
//# sourceMappingURL=expressions.js.map
