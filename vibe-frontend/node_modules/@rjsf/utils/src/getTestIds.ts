import get from 'lodash/get';
import uniqueId from 'lodash/uniqueId';

import { TestIdShape } from './types';

/** Returns an object of test IDs that can only be used in test mode. If the function is called in a test environment
 * (`NODE_ENV === 'test'`, this is set by jest) then a Proxy object will be returned. If a key within the returned
 * object is accessed, if the value already exists the object will return that value, otherwise it will create that key
 * with a generated `uuid` value and return the generated ID. If it is called outside of a test environment, the
 * function will return an empty object, therefore returning `undefined` for any property within the object and
 * excluding the prop from the rendered output of the component in which it is used.
 * This implementation was adapted from the following blog post: https://www.matthewsessions.com/blog/react-test-id/
 * To use this helper, you will want to generate a separate object for each component to avoid potential overlapping of
 * ID names. You will also want to export the object for use in tests, because the keys will be generated in the
 * component file, and used in the test file. Within the component file, add:
 * `export const TEST_IDS = getTestIds();`
 * Then pass `TEST_IDS.examplePropertyName` as the value of the test ID attribute of the intended component. This will
 * allow you to use `TEST_IDS.examplePropertyName` within your tests, while keeping the test IDs out of your rendered
 * output.
 */
export default function getTestIds(): TestIdShape {
  // For some reason, even though process.env contains the value of `test` for NODE_ENV, accessing it directly returns
  // 'development'. Using `get()` does, in fact, return test so sticking with it
  if (typeof process === 'undefined' || get(process, 'env.NODE_ENV') !== 'test') {
    return {};
  }

  const ids = new Map();
  return new Proxy(
    {},
    {
      get(_obj, prop) {
        if (!ids.has(prop)) {
          ids.set(prop, uniqueId('test-id-'));
        }
        return ids.get(prop);
      },
    },
  );
}
