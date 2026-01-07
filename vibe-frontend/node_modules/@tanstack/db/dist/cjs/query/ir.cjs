"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
class BaseExpression {
}
class CollectionRef extends BaseExpression {
  constructor(collection, alias) {
    super();
    this.collection = collection;
    this.alias = alias;
    this.type = `collectionRef`;
  }
}
class QueryRef extends BaseExpression {
  constructor(query, alias) {
    super();
    this.query = query;
    this.alias = alias;
    this.type = `queryRef`;
  }
}
class PropRef extends BaseExpression {
  constructor(path) {
    super();
    this.path = path;
    this.type = `ref`;
  }
}
class Value extends BaseExpression {
  constructor(value) {
    super();
    this.value = value;
    this.type = `val`;
  }
}
class Func extends BaseExpression {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
    this.type = `func`;
  }
}
class Aggregate extends BaseExpression {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
    this.type = `agg`;
  }
}
function isExpressionLike(value) {
  return value instanceof Aggregate || value instanceof Func || value instanceof PropRef || value instanceof Value;
}
function getWhereExpression(where) {
  return typeof where === `object` && `expression` in where ? where.expression : where;
}
function getHavingExpression(having) {
  return typeof having === `object` && `expression` in having ? having.expression : having;
}
function isResidualWhere(where) {
  return typeof where === `object` && `expression` in where && where.residual === true;
}
function createResidualWhere(expression) {
  return { expression, residual: true };
}
function getRefFromAlias(query, alias) {
  if (query.from.alias === alias) {
    return query.from;
  }
  for (const join of query.join || []) {
    if (join.from.alias === alias) {
      return join.from;
    }
  }
}
function followRef(query, ref, collection) {
  if (ref.path.length === 0) {
    return;
  }
  if (ref.path.length === 1) {
    const field = ref.path[0];
    if (query.select) {
      const selectedField = query.select[field];
      if (selectedField && selectedField.type === `ref`) {
        return followRef(query, selectedField, collection);
      }
    }
    return { collection, path: [field] };
  }
  if (ref.path.length > 1) {
    const [alias, ...rest] = ref.path;
    const aliasRef = getRefFromAlias(query, alias);
    if (!aliasRef) {
      return;
    }
    if (aliasRef.type === `queryRef`) {
      return followRef(aliasRef.query, new PropRef(rest), collection);
    } else {
      return { collection: aliasRef.collection, path: rest };
    }
  }
}
exports.Aggregate = Aggregate;
exports.CollectionRef = CollectionRef;
exports.Func = Func;
exports.PropRef = PropRef;
exports.QueryRef = QueryRef;
exports.Value = Value;
exports.createResidualWhere = createResidualWhere;
exports.followRef = followRef;
exports.getHavingExpression = getHavingExpression;
exports.getWhereExpression = getWhereExpression;
exports.isExpressionLike = isExpressionLike;
exports.isResidualWhere = isResidualWhere;
//# sourceMappingURL=ir.cjs.map
