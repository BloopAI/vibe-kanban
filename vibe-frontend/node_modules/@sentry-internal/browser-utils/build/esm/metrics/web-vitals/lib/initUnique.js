/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const instanceMap = new WeakMap();

/**
 * A function that accepts and identity object and a class object and returns
 * either a new instance of that class or an existing instance, if the
 * identity object was previously used.
 */
function initUnique(identityObj, ClassObj) {
  if (!instanceMap.get(identityObj)) {
    instanceMap.set(identityObj, new ClassObj());
  }
  return instanceMap.get(identityObj) ;
}

export { initUnique };
//# sourceMappingURL=initUnique.js.map
