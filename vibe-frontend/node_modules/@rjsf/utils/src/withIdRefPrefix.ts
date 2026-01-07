import { REF_KEY, ROOT_SCHEMA_PREFIX } from './constants';
import { RJSFSchema, StrictRJSFSchema } from './types';
import isObject from 'lodash/isObject';

/** Takes a `node` object and transforms any contained `$ref` node variables with a prefix, recursively calling
 * `withIdRefPrefix` for any other elements.
 *
 * @param node - The object node to which a ROOT_SCHEMA_PREFIX is added when a REF_KEY is part of it
 */
function withIdRefPrefixObject<S extends StrictRJSFSchema = RJSFSchema>(node: S): S {
  for (const key in node) {
    const realObj: { [k: string]: any } = node;
    const value = realObj[key];
    if (key === REF_KEY && typeof value === 'string' && value.startsWith('#')) {
      realObj[key] = ROOT_SCHEMA_PREFIX + value;
    } else {
      realObj[key] = withIdRefPrefix<S>(value);
    }
  }
  return node;
}

/** Takes a `node` object list and transforms any contained `$ref` node variables with a prefix, recursively calling
 * `withIdRefPrefix` for any other elements.
 *
 * @param node - The list of object nodes to which a ROOT_SCHEMA_PREFIX is added when a REF_KEY is part of it
 */
function withIdRefPrefixArray<S extends StrictRJSFSchema = RJSFSchema>(node: S[]): S[] {
  for (let i = 0; i < node.length; i++) {
    node[i] = withIdRefPrefix<S>(node[i]) as S;
  }
  return node;
}

/** Recursively prefixes all `$ref`s in a schema with the value of the `ROOT_SCHEMA_PREFIX` constant.
 * This is used in isValid to make references to the rootSchema
 *
 * @param schemaNode - The object node to which a ROOT_SCHEMA_PREFIX is added when a REF_KEY is part of it
 * @returns - A copy of the `schemaNode` with updated `$ref`s
 */
export default function withIdRefPrefix<S extends StrictRJSFSchema = RJSFSchema>(
  schemaNode: S | S[] | S[keyof S],
): S | S[] | S[keyof S] {
  if (Array.isArray(schemaNode)) {
    return withIdRefPrefixArray<S>([...schemaNode]);
  }
  if (isObject(schemaNode)) {
    return withIdRefPrefixObject<S>({ ...schemaNode });
  }
  return schemaNode;
}
