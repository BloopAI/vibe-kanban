/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
type Func = () => void;
/**
 * Returns a function that will execute all functions passed when called. It is generally used
 * to register multiple lexical listeners and then tear them down with a single function call, such
 * as React's useEffect hook.
 * @example
 * ```ts
 * useEffect(() => {
 *   return mergeRegister(
 *     editor.registerCommand(...registerCommand1 logic),
 *     editor.registerCommand(...registerCommand2 logic),
 *     editor.registerCommand(...registerCommand3 logic)
 *   )
 * }, [editor])
 * ```
 * In this case, useEffect is returning the function returned by mergeRegister as a cleanup
 * function to be executed after either the useEffect runs again (due to one of its dependencies
 * updating) or the component it resides in unmounts.
 * Note the functions don't necessarily need to be in an array as all arguments
 * are considered to be the func argument and spread from there.
 * The order of cleanup is the reverse of the argument order. Generally it is
 * expected that the first "acquire" will be "released" last (LIFO order),
 * because a later step may have some dependency on an earlier one.
 * @param func - An array of cleanup functions meant to be executed by the returned function.
 * @returns the function which executes all the passed cleanup functions.
 */
export default function mergeRegister(...func: Array<Func>): () => void;
export {};
