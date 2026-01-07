(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.rfc6902 = {}));
})(this, (function (exports) { 'use strict';

  /**
  Unescape token part of a JSON Pointer string

  `token` should *not* contain any '/' characters.

  > Evaluation of each reference token begins by decoding any escaped
  > character sequence.  This is performed by first transforming any
  > occurrence of the sequence '~1' to '/', and then transforming any
  > occurrence of the sequence '~0' to '~'.  By performing the
  > substitutions in this order, an implementation avoids the error of
  > turning '~01' first into '~1' and then into '/', which would be
  > incorrect (the string '~01' correctly becomes '~1' after
  > transformation).

  Here's my take:

  ~1 is unescaped with higher priority than ~0 because it is a lower-order escape character.
  I say "lower order" because '/' needs escaping due to the JSON Pointer serialization technique.
  Whereas, '~' is escaped because escaping '/' uses the '~' character.
  */
  function unescape(token) {
      return token.replace(/~1/g, '/').replace(/~0/g, '~');
  }
  /** Escape token part of a JSON Pointer string

  > '~' needs to be encoded as '~0' and '/'
  > needs to be encoded as '~1' when these characters appear in a
  > reference token.

  This is the exact inverse of `unescape()`, so the reverse replacements must take place in reverse order.
  */
  function escape(token) {
      return token.replace(/~/g, '~0').replace(/\//g, '~1');
  }
  /**
  JSON Pointer representation
  */
  class Pointer {
      constructor(tokens = ['']) {
          this.tokens = tokens;
      }
      /**
      `path` *must* be a properly escaped string.
      */
      static fromJSON(path) {
          const tokens = path.split('/').map(unescape);
          if (tokens[0] !== '')
              throw new Error(`Invalid JSON Pointer: ${path}`);
          return new Pointer(tokens);
      }
      toString() {
          return this.tokens.map(escape).join('/');
      }
      /**
      Returns an object with 'parent', 'key', and 'value' properties.
      In the special case that this Pointer's path == "",
      this object will be {parent: null, key: '', value: object}.
      Otherwise, parent and key will have the property such that parent[key] == value.
      */
      evaluate(object) {
          let parent = null;
          let key = '';
          let value = object;
          for (let i = 1, l = this.tokens.length; i < l; i++) {
              parent = value;
              key = this.tokens[i];
              if (key == '__proto__' || key == 'constructor' || key == 'prototype') {
                  continue;
              }
              // not sure if this the best way to handle non-existant paths...
              value = (parent || {})[key];
          }
          return { parent, key, value };
      }
      get(object) {
          return this.evaluate(object).value;
      }
      set(object, value) {
          const endpoint = this.evaluate(object);
          if (endpoint.parent) {
              endpoint.parent[endpoint.key] = value;
          }
      }
      push(token) {
          // mutable
          this.tokens.push(token);
      }
      /**
      `token` should be a String. It'll be coerced to one anyway.
    
      immutable (shallowly)
      */
      add(token) {
          const tokens = this.tokens.concat(String(token));
          return new Pointer(tokens);
      }
  }

  const hasOwnProperty = Object.prototype.hasOwnProperty;
  function objectType(object) {
      if (object === undefined) {
          return 'undefined';
      }
      if (object === null) {
          return 'null';
      }
      if (Array.isArray(object)) {
          return 'array';
      }
      return typeof object;
  }
  function isNonPrimitive(value) {
      // loose-equality checking for null is faster than strict checking for each of null/undefined/true/false
      // checking null first, then calling typeof, is faster than vice-versa
      return value != null && typeof value == 'object';
  }
  /**
  Recursively copy a value.

  @param source - should be a JavaScript primitive, Array, Date, or (plain old) Object.
  @returns copy of source where every Array and Object have been recursively
           reconstructed from their constituent elements
  */
  function clone(source) {
      if (!isNonPrimitive(source)) {
          // short-circuiting is faster than a single return
          return source;
      }
      // x.constructor == Array is the fastest way to check if x is an Array
      if (source.constructor == Array) {
          // construction via imperative for-loop is faster than source.map(arrayVsObject)
          const length = source.length;
          // setting the Array length during construction is faster than just `[]` or `new Array()`
          const arrayTarget = new Array(length);
          for (let i = 0; i < length; i++) {
              arrayTarget[i] = clone(source[i]);
          }
          return arrayTarget;
      }
      // Date
      if (source.constructor == Date) {
          const dateTarget = new Date(+source);
          return dateTarget;
      }
      // Object
      const objectTarget = {};
      // declaring the variable (with const) inside the loop is faster
      for (const key in source) {
          // hasOwnProperty costs a bit of performance, but it's semantically necessary
          // using a global helper is MUCH faster than calling source.hasOwnProperty(key)
          if (hasOwnProperty.call(source, key)) {
              objectTarget[key] = clone(source[key]);
          }
      }
      return objectTarget;
  }

  function isDestructive({ op }) {
      return op === 'remove' || op === 'replace' || op === 'copy' || op === 'move';
  }
  /**
  List the keys in `minuend` that are not in `subtrahend`.

  A key is only considered if it is both 1) an own-property (o.hasOwnProperty(k))
  of the object, and 2) has a value that is not undefined. This is to match JSON
  semantics, where JSON object serialization drops keys with undefined values.

  @param minuend Object of interest
  @param subtrahend Object of comparison
  @returns Array of keys that are in `minuend` but not in `subtrahend`.
  */
  function subtract(minuend, subtrahend) {
      // initialize empty object; we only care about the keys, the values can be anything
      const obj = {};
      // build up obj with all the properties of minuend
      for (const add_key in minuend) {
          if (hasOwnProperty.call(minuend, add_key) && minuend[add_key] !== undefined) {
              obj[add_key] = 1;
          }
      }
      // now delete all the properties of subtrahend from obj
      // (deleting a missing key has no effect)
      for (const del_key in subtrahend) {
          if (hasOwnProperty.call(subtrahend, del_key) && subtrahend[del_key] !== undefined) {
              delete obj[del_key];
          }
      }
      // finally, extract whatever keys remain in obj
      return Object.keys(obj);
  }
  /**
  List the keys that shared by all `objects`.

  The semantics of what constitutes a "key" is described in {@link subtract}.

  @param objects Array of objects to compare
  @returns Array of keys that are in ("own-properties" of) every object in `objects`.
  */
  function intersection(objects) {
      const length = objects.length;
      // prepare empty counter to keep track of how many objects each key occurred in
      const counter = {};
      // go through each object and increment the counter for each key in that object
      for (let i = 0; i < length; i++) {
          const object = objects[i];
          for (const key in object) {
              if (hasOwnProperty.call(object, key) && object[key] !== undefined) {
                  counter[key] = (counter[key] || 0) + 1;
              }
          }
      }
      // now delete all keys from the counter that were not seen in every object
      for (const key in counter) {
          if (counter[key] < length) {
              delete counter[key];
          }
      }
      // finally, extract whatever keys remain in the counter
      return Object.keys(counter);
  }
  function isArrayAdd(array_operation) {
      return array_operation.op === 'add';
  }
  function isArrayRemove(array_operation) {
      return array_operation.op === 'remove';
  }
  function appendArrayOperation(base, operation) {
      return {
          // the new operation must be pushed on the end
          operations: base.operations.concat(operation),
          cost: base.cost + 1,
      };
  }
  /**
  Calculate the shortest sequence of operations to get from `input` to `output`,
  using a dynamic programming implementation of the Levenshtein distance algorithm.

  To get from the input ABC to the output AZ we could just delete all the input
  and say "insert A, insert Z" and be done with it. That's what we do if the
  input is empty. But we can be smarter.

            output
                 A   Z
                 -   -
            [0]  1   2
  input A |  1  [0]  1
        B |  2  [1]  1
        C |  3   2  [2]

  1) start at 0,0 (+0)
  2) keep A (+0)
  3) remove B (+1)
  4) replace C with Z (+1)

  If the `input` (source) is empty, they'll all be in the top row, resulting in an
  array of 'add' operations.
  If the `output` (target) is empty, everything will be in the left column,
  resulting in an array of 'remove' operations.

  @returns A list of add/remove/replace operations.
  */
  function diffArrays(input, output, ptr, diff = diffAny) {
      // set up cost matrix (very simple initialization: just a map)
      const memo = {
          '0,0': { operations: [], cost: 0 },
      };
      /**
      Calculate the cheapest sequence of operations required to get from
      input.slice(0, i) to output.slice(0, j).
      There may be other valid sequences with the same cost, but none cheaper.
    
      @param i The row in the layout above
      @param j The column in the layout above
      @returns An object containing a list of operations, along with the total cost
               of applying them (+1 for each add/remove/replace operation)
      */
      function dist(i, j) {
          // memoized
          const memo_key = `${i},${j}`;
          let memoized = memo[memo_key];
          if (memoized === undefined) {
              // TODO: this !diff(...).length usage could/should be lazy
              if (i > 0 && j > 0 && !diff(input[i - 1], output[j - 1], ptr.add(String(i - 1))).length) {
                  // equal (no operations => no cost)
                  memoized = dist(i - 1, j - 1);
              }
              else {
                  const alternatives = [];
                  if (i > 0) {
                      // NOT topmost row
                      const remove_base = dist(i - 1, j);
                      const remove_operation = {
                          op: 'remove',
                          index: i - 1,
                      };
                      alternatives.push(appendArrayOperation(remove_base, remove_operation));
                  }
                  if (j > 0) {
                      // NOT leftmost column
                      const add_base = dist(i, j - 1);
                      const add_operation = {
                          op: 'add',
                          index: i - 1,
                          value: output[j - 1],
                      };
                      alternatives.push(appendArrayOperation(add_base, add_operation));
                  }
                  if (i > 0 && j > 0) {
                      // TABLE MIDDLE
                      // supposing we replaced it, compute the rest of the costs:
                      const replace_base = dist(i - 1, j - 1);
                      // okay, the general plan is to replace it, but we can be smarter,
                      // recursing into the structure and replacing only part of it if
                      // possible, but to do so we'll need the original value
                      const replace_operation = {
                          op: 'replace',
                          index: i - 1,
                          original: input[i - 1],
                          value: output[j - 1],
                      };
                      alternatives.push(appendArrayOperation(replace_base, replace_operation));
                  }
                  // the only other case, i === 0 && j === 0, has already been memoized
                  // the meat of the algorithm:
                  // sort by cost to find the lowest one (might be several ties for lowest)
                  // [4, 6, 7, 1, 2].sort((a, b) => a - b) -> [ 1, 2, 4, 6, 7 ]
                  const best = alternatives.sort((a, b) => a.cost - b.cost)[0];
                  memoized = best;
              }
              memo[memo_key] = memoized;
          }
          return memoized;
      }
      // handle weird objects masquerading as Arrays that don't have proper length
      // properties by using 0 for everything but positive numbers
      const input_length = (isNaN(input.length) || input.length <= 0) ? 0 : input.length;
      const output_length = (isNaN(output.length) || output.length <= 0) ? 0 : output.length;
      const array_operations = dist(input_length, output_length).operations;
      const [padded_operations] = array_operations.reduce(([operations, padding], array_operation) => {
          if (isArrayAdd(array_operation)) {
              const padded_index = array_operation.index + 1 + padding;
              const index_token = padded_index < (input_length + padding) ? String(padded_index) : '-';
              const operation = {
                  op: array_operation.op,
                  path: ptr.add(index_token).toString(),
                  value: array_operation.value,
              };
              // padding++ // maybe only if array_operation.index > -1 ?
              return [operations.concat(operation), padding + 1];
          }
          else if (isArrayRemove(array_operation)) {
              const operation = {
                  op: array_operation.op,
                  path: ptr.add(String(array_operation.index + padding)).toString(),
              };
              // padding--
              return [operations.concat(operation), padding - 1];
          }
          else { // replace
              const replace_ptr = ptr.add(String(array_operation.index + padding));
              const replace_operations = diff(array_operation.original, array_operation.value, replace_ptr);
              return [operations.concat(...replace_operations), padding];
          }
      }, [[], 0]);
      return padded_operations;
  }
  function diffObjects(input, output, ptr, diff = diffAny) {
      // if a key is in input but not output -> remove it
      const operations = [];
      subtract(input, output).forEach(key => {
          operations.push({ op: 'remove', path: ptr.add(key).toString() });
      });
      // if a key is in output but not input -> add it
      subtract(output, input).forEach(key => {
          operations.push({ op: 'add', path: ptr.add(key).toString(), value: output[key] });
      });
      // if a key is in both, diff it recursively
      intersection([input, output]).forEach(key => {
          operations.push(...diff(input[key], output[key], ptr.add(key)));
      });
      return operations;
  }
  /**
  `diffAny()` returns an empty array if `input` and `output` are materially equal
  (i.e., would produce equivalent JSON); otherwise it produces an array of patches
  that would transform `input` into `output`.

  > Here, "equal" means that the value at the target location and the
  > value conveyed by "value" are of the same JSON type, and that they
  > are considered equal by the following rules for that type:
  > o  strings: are considered equal if they contain the same number of
  >    Unicode characters and their code points are byte-by-byte equal.
  > o  numbers: are considered equal if their values are numerically
  >    equal.
  > o  arrays: are considered equal if they contain the same number of
  >    values, and if each value can be considered equal to the value at
  >    the corresponding position in the other array, using this list of
  >    type-specific rules.
  > o  objects: are considered equal if they contain the same number of
  >    members, and if each member can be considered equal to a member in
  >    the other object, by comparing their keys (as strings) and their
  >    values (using this list of type-specific rules).
  > o  literals (false, true, and null): are considered equal if they are
  >    the same.
  */
  function diffAny(input, output, ptr, diff = diffAny) {
      // strict equality handles literals, numbers, and strings (a sufficient but not necessary cause)
      if (input === output) {
          return [];
      }
      const input_type = objectType(input);
      const output_type = objectType(output);
      if (input_type == 'array' && output_type == 'array') {
          return diffArrays(input, output, ptr, diff);
      }
      if (input_type == 'object' && output_type == 'object') {
          return diffObjects(input, output, ptr, diff);
      }
      // at this point we know that input and output are materially different;
      // could be array -> object, object -> array, boolean -> undefined,
      // number -> string, or some other combination, but nothing that can be split
      // up into multiple patches: so `output` must replace `input` wholesale.
      return [{ op: 'replace', path: ptr.toString(), value: output }];
  }

  class MissingError extends Error {
      constructor(path) {
          super(`Value required at path: ${path}`);
          this.path = path;
          this.name = 'MissingError';
      }
  }
  class TestError extends Error {
      constructor(actual, expected) {
          super(`Test failed: ${actual} != ${expected}`);
          this.actual = actual;
          this.expected = expected;
          this.name = 'TestError';
      }
  }
  function _add(object, key, value) {
      if (Array.isArray(object)) {
          // `key` must be an index
          if (key == '-') {
              object.push(value);
          }
          else {
              const index = parseInt(key, 10);
              object.splice(index, 0, value);
          }
      }
      else {
          object[key] = value;
      }
  }
  function _remove(object, key) {
      if (Array.isArray(object)) {
          // '-' syntax doesn't make sense when removing
          const index = parseInt(key, 10);
          object.splice(index, 1);
      }
      else {
          // not sure what the proper behavior is when path = ''
          delete object[key];
      }
  }
  /**
  >  o  If the target location specifies an array index, a new value is
  >     inserted into the array at the specified index.
  >  o  If the target location specifies an object member that does not
  >     already exist, a new member is added to the object.
  >  o  If the target location specifies an object member that does exist,
  >     that member's value is replaced.
  */
  function add(object, operation) {
      const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
      // it's not exactly a "MissingError" in the same way that `remove` is -- more like a MissingParent, or something
      if (endpoint.parent === undefined) {
          return new MissingError(operation.path);
      }
      _add(endpoint.parent, endpoint.key, clone(operation.value));
      return null;
  }
  /**
  > The "remove" operation removes the value at the target location.
  > The target location MUST exist for the operation to be successful.
  */
  function remove(object, operation) {
      // endpoint has parent, key, and value properties
      const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
      if (endpoint.value === undefined) {
          return new MissingError(operation.path);
      }
      // not sure what the proper behavior is when path = ''
      _remove(endpoint.parent, endpoint.key);
      return null;
  }
  /**
  > The "replace" operation replaces the value at the target location
  > with a new value.  The operation object MUST contain a "value" member
  > whose content specifies the replacement value.
  > The target location MUST exist for the operation to be successful.

  > This operation is functionally identical to a "remove" operation for
  > a value, followed immediately by an "add" operation at the same
  > location with the replacement value.

  Even more simply, it's like the add operation with an existence check.
  */
  function replace(object, operation) {
      const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
      if (endpoint.parent === null) {
          return new MissingError(operation.path);
      }
      // this existence check treats arrays as a special case
      if (Array.isArray(endpoint.parent)) {
          if (parseInt(endpoint.key, 10) >= endpoint.parent.length) {
              return new MissingError(operation.path);
          }
      }
      else if (endpoint.value === undefined) {
          return new MissingError(operation.path);
      }
      endpoint.parent[endpoint.key] = operation.value;
      return null;
  }
  /**
  > The "move" operation removes the value at a specified location and
  > adds it to the target location.
  > The operation object MUST contain a "from" member, which is a string
  > containing a JSON Pointer value that references the location in the
  > target document to move the value from.
  > This operation is functionally identical to a "remove" operation on
  > the "from" location, followed immediately by an "add" operation at
  > the target location with the value that was just removed.

  > The "from" location MUST NOT be a proper prefix of the "path"
  > location; i.e., a location cannot be moved into one of its children.

  TODO: throw if the check described in the previous paragraph fails.
  */
  function move(object, operation) {
      const from_endpoint = Pointer.fromJSON(operation.from).evaluate(object);
      if (from_endpoint.value === undefined) {
          return new MissingError(operation.from);
      }
      const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
      if (endpoint.parent === undefined) {
          return new MissingError(operation.path);
      }
      _remove(from_endpoint.parent, from_endpoint.key);
      _add(endpoint.parent, endpoint.key, from_endpoint.value);
      return null;
  }
  /**
  > The "copy" operation copies the value at a specified location to the
  > target location.
  > The operation object MUST contain a "from" member, which is a string
  > containing a JSON Pointer value that references the location in the
  > target document to copy the value from.
  > The "from" location MUST exist for the operation to be successful.

  > This operation is functionally identical to an "add" operation at the
  > target location using the value specified in the "from" member.

  Alternatively, it's like 'move' without the 'remove'.
  */
  function copy(object, operation) {
      const from_endpoint = Pointer.fromJSON(operation.from).evaluate(object);
      if (from_endpoint.value === undefined) {
          return new MissingError(operation.from);
      }
      const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
      if (endpoint.parent === undefined) {
          return new MissingError(operation.path);
      }
      _add(endpoint.parent, endpoint.key, clone(from_endpoint.value));
      return null;
  }
  /**
  > The "test" operation tests that a value at the target location is
  > equal to a specified value.
  > The operation object MUST contain a "value" member that conveys the
  > value to be compared to the target location's value.
  > The target location MUST be equal to the "value" value for the
  > operation to be considered successful.
  */
  function test(object, operation) {
      const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
      // TODO: this diffAny(...).length usage could/should be lazy
      if (diffAny(endpoint.value, operation.value, new Pointer()).length) {
          return new TestError(endpoint.value, operation.value);
      }
      return null;
  }
  class InvalidOperationError extends Error {
      constructor(operation) {
          super(`Invalid operation: ${operation.op}`);
          this.operation = operation;
          this.name = 'InvalidOperationError';
      }
  }
  /**
  Switch on `operation.op`, applying the corresponding patch function for each
  case to `object`.
  */
  function apply(object, operation) {
      // not sure why TypeScript can't infer typesafety of:
      //   {add, remove, replace, move, copy, test}[operation.op](object, operation)
      // (seems like a bug)
      switch (operation.op) {
          case 'add': return add(object, operation);
          case 'remove': return remove(object, operation);
          case 'replace': return replace(object, operation);
          case 'move': return move(object, operation);
          case 'copy': return copy(object, operation);
          case 'test': return test(object, operation);
      }
      return new InvalidOperationError(operation);
  }

  /**
  Apply a 'application/json-patch+json'-type patch to an object.

  `patch` *must* be an array of operations.

  > Operation objects MUST have exactly one "op" member, whose value
  > indicates the operation to perform.  Its value MUST be one of "add",
  > "remove", "replace", "move", "copy", or "test"; other values are
  > errors.

  This method mutates the target object in-place.

  @returns list of results, one for each operation: `null` indicated success,
           otherwise, the result will be an instance of one of the Error classes:
           MissingError, InvalidOperationError, or TestError.
  */
  function applyPatch(object, patch) {
      return patch.map(operation => apply(object, operation));
  }
  function wrapVoidableDiff(diff) {
      function wrappedDiff(input, output, ptr) {
          const custom_patch = diff(input, output, ptr);
          // ensure an array is always returned
          return Array.isArray(custom_patch) ? custom_patch : diffAny(input, output, ptr, wrappedDiff);
      }
      return wrappedDiff;
  }
  /**
  Produce a 'application/json-patch+json'-type patch to get from one object to
  another.

  This does not alter `input` or `output` unless they have a property getter with
  side-effects (which is not a good idea anyway).

  `diff` is called on each pair of comparable non-primitive nodes in the
  `input`/`output` object trees, producing nested patches. Return `undefined`
  to fall back to default behaviour.

  Returns list of operations to perform on `input` to produce `output`.
  */
  function createPatch(input, output, diff) {
      const ptr = new Pointer();
      // a new Pointer gets a default path of [''] if not specified
      return (diff ? wrapVoidableDiff(diff) : diffAny)(input, output, ptr);
  }
  /**
  Create a test operation based on `input`'s current evaluation of the JSON
  Pointer `path`; if such a pointer cannot be resolved, returns undefined.
  */
  function createTest(input, path) {
      const endpoint = Pointer.fromJSON(path).evaluate(input);
      if (endpoint !== undefined) {
          return { op: 'test', path, value: endpoint.value };
      }
  }
  /**
  Produce an 'application/json-patch+json'-type list of tests, to verify that
  existing values in an object are identical to the those captured at some
  checkpoint (whenever this function is called).

  This does not alter `input` or `output` unless they have a property getter with
  side-effects (which is not a good idea anyway).

  Returns list of test operations.
  */
  function createTests(input, patch) {
      const tests = new Array();
      patch.filter(isDestructive).forEach(operation => {
          const pathTest = createTest(input, operation.path);
          if (pathTest)
              tests.push(pathTest);
          if ('from' in operation) {
              const fromTest = createTest(input, operation.from);
              if (fromTest)
                  tests.push(fromTest);
          }
      });
      return tests;
  }

  exports.Pointer = Pointer;
  exports.applyPatch = applyPatch;
  exports.createPatch = createPatch;
  exports.createTests = createTests;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
