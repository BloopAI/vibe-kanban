// This file was copied from https://github.com/qwertie/btree-typescript/tree/master and adapted to our needs.
// We removed methods that we don't need.

// B+ tree by David Piepgrass. License: MIT
type EditRangeResult<V, R = number> = {
  value?: V
  break?: R
  delete?: boolean
}

type index = number

// Informative microbenchmarks & stuff:
// http://www.jayconrod.com/posts/52/a-tour-of-v8-object-representation (very educational)
// https://blog.mozilla.org/luke/2012/10/02/optimizing-javascript-variable-access/ (local vars are faster than properties)
// http://benediktmeurer.de/2017/12/13/an-introduction-to-speculative-optimization-in-v8/ (other stuff)
// https://jsperf.com/js-in-operator-vs-alternatives (avoid 'in' operator; `.p!==undefined` faster than `hasOwnProperty('p')` in all browsers)
// https://jsperf.com/instanceof-vs-typeof-vs-constructor-vs-member (speed of type tests varies wildly across browsers)
// https://jsperf.com/detecting-arrays-new (a.constructor===Array is best across browsers, assuming a is an object)
// https://jsperf.com/shallow-cloning-methods (a constructor is faster than Object.create; hand-written clone faster than Object.assign)
// https://jsperf.com/ways-to-fill-an-array (slice-and-replace is fastest)
// https://jsperf.com/math-min-max-vs-ternary-vs-if (Math.min/max is slow on Edge)
// https://jsperf.com/array-vs-property-access-speed (v.x/v.y is faster than a[0]/a[1] in major browsers IF hidden class is constant)
// https://jsperf.com/detect-not-null-or-undefined (`x==null` slightly slower than `x===null||x===undefined` on all browsers)
// Overall, microbenchmarks suggest Firefox is the fastest browser for JavaScript and Edge is the slowest.
// Lessons from https://v8project.blogspot.com/2017/09/elements-kinds-in-v8.html:
//   - Avoid holes in arrays. Avoid `new Array(N)`, it will be "holey" permanently.
//   - Don't read outside bounds of an array (it scans prototype chain).
//   - Small integer arrays are stored differently from doubles
//   - Adding non-numbers to an array deoptimizes it permanently into a general array
//   - Objects can be used like arrays (e.g. have length property) but are slower
//   - V8 source (NewElementsCapacity in src/objects.h): arrays grow by 50% + 16 elements

/**
 * A reasonably fast collection of key-value pairs with a powerful API.
 * Largely compatible with the standard Map. BTree is a B+ tree data structure,
 * so the collection is sorted by key.
 *
 * B+ trees tend to use memory more efficiently than hashtables such as the
 * standard Map, especially when the collection contains a large number of
 * items. However, maintaining the sort order makes them modestly slower:
 * O(log size) rather than O(1). This B+ tree implementation supports O(1)
 * fast cloning. It also supports freeze(), which can be used to ensure that
 * a BTree is not changed accidentally.
 *
 * Confusingly, the ES6 Map.forEach(c) method calls c(value,key) instead of
 * c(key,value), in contrast to other methods such as set() and entries()
 * which put the key first. I can only assume that the order was reversed on
 * the theory that users would usually want to examine values and ignore keys.
 * BTree's forEach() therefore works the same way, but a second method
 * `.forEachPair((key,value)=>{...})` is provided which sends you the key
 * first and the value second; this method is slightly faster because it is
 * the "native" for-each method for this class.
 *
 * Out of the box, BTree supports keys that are numbers, strings, arrays of
 * numbers/strings, Date, and objects that have a valueOf() method returning a
 * number or string. Other data types, such as arrays of Date or custom
 * objects, require a custom comparator, which you must pass as the second
 * argument to the constructor (the first argument is an optional list of
 * initial items). Symbols cannot be used as keys because they are unordered
 * (one Symbol is never "greater" or "less" than another).
 *
 * @example
 * Given a {name: string, age: number} object, you can create a tree sorted by
 * name and then by age like this:
 *
 *     var tree = new BTree(undefined, (a, b) => {
 *       if (a.name > b.name)
 *         return 1; // Return a number >0 when a > b
 *       else if (a.name < b.name)
 *         return -1; // Return a number <0 when a < b
 *       else // names are equal (or incomparable)
 *         return a.age - b.age; // Return >0 when a.age > b.age
 *     });
 *
 *     tree.set({name:"Bill", age:17}, "happy");
 *     tree.set({name:"Fran", age:40}, "busy & stressed");
 *     tree.set({name:"Bill", age:55}, "recently laid off");
 *     tree.forEachPair((k, v) => {
 *       console.log(`Name: ${k.name} Age: ${k.age} Status: ${v}`);
 *     });
 *
 * @description
 * The "range" methods (`forEach, forRange, editRange`) will return the number
 * of elements that were scanned. In addition, the callback can return {break:R}
 * to stop early and return R from the outer function.
 *
 * - TODO: Test performance of preallocating values array at max size
 * - TODO: Add fast initialization when a sorted array is provided to constructor
 *
 * For more documentation see https://github.com/qwertie/btree-typescript
 *
 * Are you a C# developer? You might like the similar data structures I made for C#:
 * BDictionary, BList, etc. See http://core.loyc.net/collections/
 *
 * @author David Piepgrass
 */
export class BTree<K = any, V = any> {
  private _root: BNode<K, V> = EmptyLeaf as BNode<K, V>
  _size = 0
  _maxNodeSize: number

  /**
   * provides a total order over keys (and a strict partial order over the type K)
   * @returns a negative value if a < b, 0 if a === b and a positive value if a > b
   */
  _compare: (a: K, b: K) => number

  /**
   * Initializes an empty B+ tree.
   * @param compare Custom function to compare pairs of elements in the tree.
   *   If not specified, defaultComparator will be used which is valid as long as K extends DefaultComparable.
   * @param entries A set of key-value pairs to initialize the tree
   * @param maxNodeSize Branching factor (maximum items or children per node)
   *   Must be in range 4..256. If undefined or <4 then default is used; if >256 then 256.
   */
  public constructor(
    compare: (a: K, b: K) => number,
    entries?: Array<[K, V]>,
    maxNodeSize?: number,
  ) {
    this._maxNodeSize = maxNodeSize! >= 4 ? Math.min(maxNodeSize!, 256) : 32
    this._compare = compare
    if (entries) this.setPairs(entries)
  }

  // ///////////////////////////////////////////////////////////////////////////
  // ES6 Map<K,V> methods /////////////////////////////////////////////////////

  /** Gets the number of key-value pairs in the tree. */
  get size() {
    return this._size
  }
  /** Gets the number of key-value pairs in the tree. */
  get length() {
    return this._size
  }
  /** Returns true iff the tree contains no key-value pairs. */
  get isEmpty() {
    return this._size === 0
  }

  /** Releases the tree so that its size is 0. */
  clear() {
    this._root = EmptyLeaf as BNode<K, V>
    this._size = 0
  }

  /**
   * Finds a pair in the tree and returns the associated value.
   * @param defaultValue a value to return if the key was not found.
   * @returns the value, or defaultValue if the key was not found.
   * @description Computational complexity: O(log size)
   */
  get(key: K, defaultValue?: V): V | undefined {
    return this._root.get(key, defaultValue, this)
  }

  /**
   * Adds or overwrites a key-value pair in the B+ tree.
   * @param key the key is used to determine the sort order of
   *        data in the tree.
   * @param value data to associate with the key (optional)
   * @param overwrite Whether to overwrite an existing key-value pair
   *        (default: true). If this is false and there is an existing
   *        key-value pair then this method has no effect.
   * @returns true if a new key-value pair was added.
   * @description Computational complexity: O(log size)
   * Note: when overwriting a previous entry, the key is updated
   * as well as the value. This has no effect unless the new key
   * has data that does not affect its sort order.
   */
  set(key: K, value: V, overwrite?: boolean): boolean {
    if (this._root.isShared) this._root = this._root.clone()
    const result = this._root.set(key, value, overwrite, this)
    if (result === true || result === false) return result
    // Root node has split, so create a new root node.
    this._root = new BNodeInternal<K, V>([this._root, result])
    return true
  }

  /**
   * Returns true if the key exists in the B+ tree, false if not.
   * Use get() for best performance; use has() if you need to
   * distinguish between "undefined value" and "key not present".
   * @param key Key to detect
   * @description Computational complexity: O(log size)
   */
  has(key: K): boolean {
    return this.forRange(key, key, true, undefined) !== 0
  }

  /**
   * Removes a single key-value pair from the B+ tree.
   * @param key Key to find
   * @returns true if a pair was found and removed, false otherwise.
   * @description Computational complexity: O(log size)
   */
  delete(key: K): boolean {
    return this.editRange(key, key, true, DeleteRange) !== 0
  }

  // ///////////////////////////////////////////////////////////////////////////
  // Additional methods ///////////////////////////////////////////////////////

  /** Returns the maximum number of children/values before nodes will split. */
  get maxNodeSize() {
    return this._maxNodeSize
  }

  /** Gets the lowest key in the tree. Complexity: O(log size) */
  minKey(): K | undefined {
    return this._root.minKey()
  }

  /** Gets the highest key in the tree. Complexity: O(1) */
  maxKey(): K | undefined {
    return this._root.maxKey()
  }

  /** Gets an array of all keys, sorted */
  keysArray() {
    const results: Array<K> = []
    this._root.forRange(
      this.minKey()!,
      this.maxKey()!,
      true,
      false,
      this,
      0,
      (k, _v) => {
        results.push(k)
      },
    )
    return results
  }

  /** Returns the next pair whose key is larger than the specified key (or undefined if there is none).
   * If key === undefined, this function returns the lowest pair.
   * @param key The key to search for.
   * @param reusedArray Optional array used repeatedly to store key-value pairs, to
   * avoid creating a new array on every iteration.
   */
  nextHigherPair(key: K | undefined, reusedArray?: [K, V]): [K, V] | undefined {
    reusedArray = reusedArray || ([] as unknown as [K, V])
    if (key === undefined) {
      return this._root.minPair(reusedArray)
    }
    return this._root.getPairOrNextHigher(
      key,
      this._compare,
      false,
      reusedArray,
    )
  }

  /** Returns the next key larger than the specified key, or undefined if there is none.
   *  Also, nextHigherKey(undefined) returns the lowest key.
   */
  nextHigherKey(key: K | undefined): K | undefined {
    const p = this.nextHigherPair(key, ReusedArray as [K, V])
    return p && p[0]
  }

  /** Returns the next pair whose key is smaller than the specified key (or undefined if there is none).
   *  If key === undefined, this function returns the highest pair.
   * @param key The key to search for.
   * @param reusedArray Optional array used repeatedly to store key-value pairs, to
   *        avoid creating a new array each time you call this method.
   */
  nextLowerPair(key: K | undefined, reusedArray?: [K, V]): [K, V] | undefined {
    reusedArray = reusedArray || ([] as unknown as [K, V])
    if (key === undefined) {
      return this._root.maxPair(reusedArray)
    }
    return this._root.getPairOrNextLower(key, this._compare, false, reusedArray)
  }

  /** Returns the next key smaller than the specified key, or undefined if there is none.
   *  Also, nextLowerKey(undefined) returns the highest key.
   */
  nextLowerKey(key: K | undefined): K | undefined {
    const p = this.nextLowerPair(key, ReusedArray as [K, V])
    return p && p[0]
  }

  /** Adds all pairs from a list of key-value pairs.
   * @param pairs Pairs to add to this tree. If there are duplicate keys,
   *        later pairs currently overwrite earlier ones (e.g. [[0,1],[0,7]]
   *        associates 0 with 7.)
   * @param overwrite Whether to overwrite pairs that already exist (if false,
   *        pairs[i] is ignored when the key pairs[i][0] already exists.)
   * @returns The number of pairs added to the collection.
   * @description Computational complexity: O(pairs.length * log(size + pairs.length))
   */
  setPairs(pairs: Array<[K, V]>, overwrite?: boolean): number {
    let added = 0
    for (const pair of pairs) {
      if (this.set(pair[0], pair[1], overwrite)) added++
    }
    return added
  }

  forRange(
    low: K,
    high: K,
    includeHigh: boolean,
    onFound?: (k: K, v: V, counter: number) => void,
    initialCounter?: number,
  ): number

  /**
   * Scans the specified range of keys, in ascending order by key.
   * Note: the callback `onFound` must not insert or remove items in the
   * collection. Doing so may cause incorrect data to be sent to the
   * callback afterward.
   * @param low The first key scanned will be greater than or equal to `low`.
   * @param high Scanning stops when a key larger than this is reached.
   * @param includeHigh If the `high` key is present, `onFound` is called for
   *        that final pair if and only if this parameter is true.
   * @param onFound A function that is called for each key-value pair. This
   *        function can return {break:R} to stop early with result R.
   * @param initialCounter Initial third argument of onFound. This value
   *        increases by one each time `onFound` is called. Default: 0
   * @returns The number of values found, or R if the callback returned
   *        `{break:R}` to stop early.
   * @description Computational complexity: O(number of items scanned + log size)
   */
  forRange<R = number>(
    low: K,
    high: K,
    includeHigh: boolean,
    onFound?: (k: K, v: V, counter: number) => { break?: R } | void,
    initialCounter?: number,
  ): R | number {
    const r = this._root.forRange(
      low,
      high,
      includeHigh,
      false,
      this,
      initialCounter || 0,
      onFound,
    )
    return typeof r === `number` ? r : r.break!
  }

  /**
   * Scans and potentially modifies values for a subsequence of keys.
   * Note: the callback `onFound` should ideally be a pure function.
   *   Specfically, it must not insert items, call clone(), or change
   *   the collection except via return value; out-of-band editing may
   *   cause an exception or may cause incorrect data to be sent to
   *   the callback (duplicate or missed items). It must not cause a
   *   clone() of the collection, otherwise the clone could be modified
   *   by changes requested by the callback.
   * @param low The first key scanned will be greater than or equal to `low`.
   * @param high Scanning stops when a key larger than this is reached.
   * @param includeHigh If the `high` key is present, `onFound` is called for
   *        that final pair if and only if this parameter is true.
   * @param onFound A function that is called for each key-value pair. This
   *        function can return `{value:v}` to change the value associated
   *        with the current key, `{delete:true}` to delete the current pair,
   *        `{break:R}` to stop early with result R, or it can return nothing
   *        (undefined or {}) to cause no effect and continue iterating.
   *        `{break:R}` can be combined with one of the other two commands.
   *        The third argument `counter` is the number of items iterated
   *        previously; it equals 0 when `onFound` is called the first time.
   * @returns The number of values scanned, or R if the callback returned
   *        `{break:R}` to stop early.
   * @description
   *   Computational complexity: O(number of items scanned + log size)
   *   Note: if the tree has been cloned with clone(), any shared
   *   nodes are copied before `onFound` is called. This takes O(n) time
   *   where n is proportional to the amount of shared data scanned.
   */
  editRange<R = V>(
    low: K,
    high: K,
    includeHigh: boolean,
    onFound: (k: K, v: V, counter: number) => EditRangeResult<V, R> | void,
    initialCounter?: number,
  ): R | number {
    let root = this._root
    if (root.isShared) this._root = root = root.clone()
    try {
      const r = root.forRange(
        low,
        high,
        includeHigh,
        true,
        this,
        initialCounter || 0,
        onFound,
      )
      return typeof r === `number` ? r : r.break!
    } finally {
      let isShared
      while (root.keys.length <= 1 && !root.isLeaf) {
        isShared ||= root.isShared
        this._root = root =
          root.keys.length === 0
            ? EmptyLeaf
            : (root as any as BNodeInternal<K, V>).children[0]!
      }
      // If any ancestor of the new root was shared, the new root must also be shared
      if (isShared) {
        root.isShared = true
      }
    }
  }
}

/** Leaf node / base class. **************************************************/
class BNode<K, V> {
  // If this is an internal node, _keys[i] is the highest key in children[i].
  keys: Array<K>
  values: Array<V>
  // True if this node might be within multiple `BTree`s (or have multiple parents).
  // If so, it must be cloned before being mutated to avoid changing an unrelated tree.
  // This is transitive: if it's true, children are also shared even if `isShared!=true`
  // in those children. (Certain operations will propagate isShared=true to children.)
  isShared: true | undefined
  get isLeaf() {
    return (this as any).children === undefined
  }

  constructor(keys: Array<K> = [], values?: Array<V>) {
    this.keys = keys
    this.values = values || undefVals
    this.isShared = undefined
  }

  // /////////////////////////////////////////////////////////////////////////
  // Shared methods /////////////////////////////////////////////////////////

  maxKey() {
    return this.keys[this.keys.length - 1]
  }

  // If key not found, returns i^failXor where i is the insertion index.
  // Callers that don't care whether there was a match will set failXor=0.
  indexOf(key: K, failXor: number, cmp: (a: K, b: K) => number): index {
    const keys = this.keys
    let lo = 0,
      hi = keys.length,
      mid = hi >> 1
    while (lo < hi) {
      const c = cmp(keys[mid]!, key)
      if (c < 0) lo = mid + 1
      else if (c > 0)
        // key < keys[mid]
        hi = mid
      else if (c === 0) return mid
      else {
        // c is NaN or otherwise invalid
        if (key === key)
          // at least the search key is not NaN
          return keys.length
        else throw new Error(`BTree: NaN was used as a key`)
      }
      mid = (lo + hi) >> 1
    }
    return mid ^ failXor
  }

  // ///////////////////////////////////////////////////////////////////////////
  // Leaf Node: misc //////////////////////////////////////////////////////////

  minKey(): K | undefined {
    return this.keys[0]
  }

  minPair(reusedArray: [K, V]): [K, V] | undefined {
    if (this.keys.length === 0) return undefined
    reusedArray[0] = this.keys[0]!
    reusedArray[1] = this.values[0]!
    return reusedArray
  }

  maxPair(reusedArray: [K, V]): [K, V] | undefined {
    if (this.keys.length === 0) return undefined
    const lastIndex = this.keys.length - 1
    reusedArray[0] = this.keys[lastIndex]!
    reusedArray[1] = this.values[lastIndex]!
    return reusedArray
  }

  clone(): BNode<K, V> {
    const v = this.values
    return new BNode<K, V>(this.keys.slice(0), v === undefVals ? v : v.slice(0))
  }

  get(key: K, defaultValue: V | undefined, tree: BTree<K, V>): V | undefined {
    const i = this.indexOf(key, -1, tree._compare)
    return i < 0 ? defaultValue : this.values[i]
  }

  getPairOrNextLower(
    key: K,
    compare: (a: K, b: K) => number,
    inclusive: boolean,
    reusedArray: [K, V],
  ): [K, V] | undefined {
    const i = this.indexOf(key, -1, compare)
    const indexOrLower = i < 0 ? ~i - 1 : inclusive ? i : i - 1
    if (indexOrLower >= 0) {
      reusedArray[0] = this.keys[indexOrLower]!
      reusedArray[1] = this.values[indexOrLower]!
      return reusedArray
    }
    return undefined
  }

  getPairOrNextHigher(
    key: K,
    compare: (a: K, b: K) => number,
    inclusive: boolean,
    reusedArray: [K, V],
  ): [K, V] | undefined {
    const i = this.indexOf(key, -1, compare)
    const indexOrLower = i < 0 ? ~i : inclusive ? i : i + 1
    const keys = this.keys
    if (indexOrLower < keys.length) {
      reusedArray[0] = keys[indexOrLower]!
      reusedArray[1] = this.values[indexOrLower]!
      return reusedArray
    }
    return undefined
  }

  // ///////////////////////////////////////////////////////////////////////////
  // Leaf Node: set & node splitting //////////////////////////////////////////

  set(
    key: K,
    value: V,
    overwrite: boolean | undefined,
    tree: BTree<K, V>,
  ): boolean | BNode<K, V> {
    let i = this.indexOf(key, -1, tree._compare)
    if (i < 0) {
      // key does not exist yet
      i = ~i
      tree._size++

      if (this.keys.length < tree._maxNodeSize) {
        return this.insertInLeaf(i, key, value, tree)
      } else {
        // This leaf node is full and must split
        const newRightSibling = this.splitOffRightSide()
        let target: BNode<K, V> = this
        if (i > this.keys.length) {
          i -= this.keys.length
          target = newRightSibling
        }
        target.insertInLeaf(i, key, value, tree)
        return newRightSibling
      }
    } else {
      // Key already exists
      if (overwrite !== false) {
        if (value !== undefined) this.reifyValues()
        // usually this is a no-op, but some users may wish to edit the key
        this.keys[i] = key
        this.values[i] = value
      }
      return false
    }
  }

  reifyValues() {
    if (this.values === undefVals)
      return (this.values = this.values.slice(0, this.keys.length))
    return this.values
  }

  insertInLeaf(i: index, key: K, value: V, tree: BTree<K, V>) {
    this.keys.splice(i, 0, key)
    if (this.values === undefVals) {
      while (undefVals.length < tree._maxNodeSize) undefVals.push(undefined)
      if (value === undefined) {
        return true
      } else {
        this.values = undefVals.slice(0, this.keys.length - 1)
      }
    }
    this.values.splice(i, 0, value)
    return true
  }

  takeFromRight(rhs: BNode<K, V>) {
    // Reminder: parent node must update its copy of key for this node
    // assert: neither node is shared
    // assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
    let v = this.values
    if (rhs.values === undefVals) {
      if (v !== undefVals) v.push(undefined as any)
    } else {
      v = this.reifyValues()
      v.push(rhs.values.shift()!)
    }
    this.keys.push(rhs.keys.shift()!)
  }

  takeFromLeft(lhs: BNode<K, V>) {
    // Reminder: parent node must update its copy of key for this node
    // assert: neither node is shared
    // assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
    let v = this.values
    if (lhs.values === undefVals) {
      if (v !== undefVals) v.unshift(undefined as any)
    } else {
      v = this.reifyValues()
      v.unshift(lhs.values.pop()!)
    }
    this.keys.unshift(lhs.keys.pop()!)
  }

  splitOffRightSide(): BNode<K, V> {
    // Reminder: parent node must update its copy of key for this node
    const half = this.keys.length >> 1,
      keys = this.keys.splice(half)
    const values =
      this.values === undefVals ? undefVals : this.values.splice(half)
    return new BNode<K, V>(keys, values)
  }

  // ///////////////////////////////////////////////////////////////////////////
  // Leaf Node: scanning & deletions //////////////////////////////////////////

  forRange<R>(
    low: K,
    high: K,
    includeHigh: boolean | undefined,
    editMode: boolean,
    tree: BTree<K, V>,
    count: number,
    onFound?: (k: K, v: V, counter: number) => EditRangeResult<V, R> | void,
  ): EditRangeResult<V, R> | number {
    const cmp = tree._compare
    let iLow, iHigh
    if (high === low) {
      if (!includeHigh) return count
      iHigh = (iLow = this.indexOf(low, -1, cmp)) + 1
      if (iLow < 0) return count
    } else {
      iLow = this.indexOf(low, 0, cmp)
      iHigh = this.indexOf(high, -1, cmp)
      if (iHigh < 0) iHigh = ~iHigh
      else if (includeHigh === true) iHigh++
    }
    const keys = this.keys,
      values = this.values
    if (onFound !== undefined) {
      for (let i = iLow; i < iHigh; i++) {
        const key = keys[i]!
        const result = onFound(key, values[i]!, count++)
        if (result !== undefined) {
          if (editMode === true) {
            if (key !== keys[i] || this.isShared === true)
              throw new Error(`BTree illegally changed or cloned in editRange`)
            if (result.delete) {
              this.keys.splice(i, 1)
              if (this.values !== undefVals) this.values.splice(i, 1)
              tree._size--
              i--
              iHigh--
            } else if (result.hasOwnProperty(`value`)) {
              values[i] = result.value!
            }
          }
          if (result.break !== undefined) return result
        }
      }
    } else count += iHigh - iLow
    return count
  }

  /** Adds entire contents of right-hand sibling (rhs is left unchanged) */
  mergeSibling(rhs: BNode<K, V>, _: number) {
    this.keys.push.apply(this.keys, rhs.keys)
    if (this.values === undefVals) {
      if (rhs.values === undefVals) return
      this.values = this.values.slice(0, this.keys.length)
    }
    this.values.push.apply(this.values, rhs.reifyValues())
  }
}

/** Internal node (non-leaf node) ********************************************/
class BNodeInternal<K, V> extends BNode<K, V> {
  // Note: conventionally B+ trees have one fewer key than the number of
  // children, but I find it easier to keep the array lengths equal: each
  // keys[i] caches the value of children[i].maxKey().
  children: Array<BNode<K, V>>

  /**
   * This does not mark `children` as shared, so it is the responsibility of the caller
   * to ensure children are either marked shared, or aren't included in another tree.
   */
  constructor(children: Array<BNode<K, V>>, keys?: Array<K>) {
    if (!keys) {
      keys = []
      for (let i = 0; i < children.length; i++) keys[i] = children[i]!.maxKey()!
    }
    super(keys)
    this.children = children
  }

  minKey() {
    return this.children[0]!.minKey()
  }

  minPair(reusedArray: [K, V]): [K, V] | undefined {
    return this.children[0]!.minPair(reusedArray)
  }

  maxPair(reusedArray: [K, V]): [K, V] | undefined {
    return this.children[this.children.length - 1]!.maxPair(reusedArray)
  }

  get(key: K, defaultValue: V | undefined, tree: BTree<K, V>): V | undefined {
    const i = this.indexOf(key, 0, tree._compare),
      children = this.children
    return i < children.length
      ? children[i]!.get(key, defaultValue, tree)
      : undefined
  }

  getPairOrNextLower(
    key: K,
    compare: (a: K, b: K) => number,
    inclusive: boolean,
    reusedArray: [K, V],
  ): [K, V] | undefined {
    const i = this.indexOf(key, 0, compare),
      children = this.children
    if (i >= children.length) return this.maxPair(reusedArray)
    const result = children[i]!.getPairOrNextLower(
      key,
      compare,
      inclusive,
      reusedArray,
    )
    if (result === undefined && i > 0) {
      return children[i - 1]!.maxPair(reusedArray)
    }
    return result
  }

  getPairOrNextHigher(
    key: K,
    compare: (a: K, b: K) => number,
    inclusive: boolean,
    reusedArray: [K, V],
  ): [K, V] | undefined {
    const i = this.indexOf(key, 0, compare),
      children = this.children,
      length = children.length
    if (i >= length) return undefined
    const result = children[i]!.getPairOrNextHigher(
      key,
      compare,
      inclusive,
      reusedArray,
    )
    if (result === undefined && i < length - 1) {
      return children[i + 1]!.minPair(reusedArray)
    }
    return result
  }

  // ///////////////////////////////////////////////////////////////////////////
  // Internal Node: set & node splitting //////////////////////////////////////

  set(
    key: K,
    value: V,
    overwrite: boolean | undefined,
    tree: BTree<K, V>,
  ): boolean | BNodeInternal<K, V> {
    const c = this.children,
      max = tree._maxNodeSize,
      cmp = tree._compare
    let i = Math.min(this.indexOf(key, 0, cmp), c.length - 1),
      child = c[i]!

    if (child.isShared) c[i] = child = child.clone()
    if (child.keys.length >= max) {
      // child is full; inserting anything else will cause a split.
      // Shifting an item to the left or right sibling may avoid a split.
      // We can do a shift if the adjacent node is not full and if the
      // current key can still be placed in the same node after the shift.
      let other: BNode<K, V> | undefined
      if (
        i > 0 &&
        (other = c[i - 1]!).keys.length < max &&
        cmp(child.keys[0]!, key) < 0
      ) {
        if (other.isShared) c[i - 1] = other = other.clone()
        other.takeFromRight(child)
        this.keys[i - 1] = other.maxKey()!
      } else if (
        (other = c[i + 1]) !== undefined &&
        other.keys.length < max &&
        cmp(child.maxKey()!, key) < 0
      ) {
        if (other.isShared) c[i + 1] = other = other.clone()
        other.takeFromLeft(child)
        this.keys[i] = c[i]!.maxKey()!
      }
    }

    const result = child.set(key, value, overwrite, tree)
    if (result === false) return false
    this.keys[i] = child.maxKey()!
    if (result === true) return true

    // The child has split and `result` is a new right child... does it fit?
    if (this.keys.length < max) {
      // yes
      this.insert(i + 1, result)
      return true
    } else {
      // no, we must split also
      const newRightSibling = this.splitOffRightSide()
      let target: BNodeInternal<K, V> = this
      if (cmp(result.maxKey()!, this.maxKey()!) > 0) {
        target = newRightSibling
        i -= this.keys.length
      }
      target.insert(i + 1, result)
      return newRightSibling
    }
  }

  /**
   * Inserts `child` at index `i`.
   * This does not mark `child` as shared, so it is the responsibility of the caller
   * to ensure that either child is marked shared, or it is not included in another tree.
   */
  insert(i: index, child: BNode<K, V>) {
    this.children.splice(i, 0, child)
    this.keys.splice(i, 0, child.maxKey()!)
  }

  /**
   * Split this node.
   * Modifies this to remove the second half of the items, returning a separate node containing them.
   */
  splitOffRightSide() {
    // assert !this.isShared;
    const half = this.children.length >> 1
    return new BNodeInternal<K, V>(
      this.children.splice(half),
      this.keys.splice(half),
    )
  }

  takeFromRight(rhs: BNode<K, V>) {
    // Reminder: parent node must update its copy of key for this node
    // assert: neither node is shared
    // assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
    this.keys.push(rhs.keys.shift()!)
    this.children.push((rhs as BNodeInternal<K, V>).children.shift()!)
  }

  takeFromLeft(lhs: BNode<K, V>) {
    // Reminder: parent node must update its copy of key for this node
    // assert: neither node is shared
    // assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
    this.keys.unshift(lhs.keys.pop()!)
    this.children.unshift((lhs as BNodeInternal<K, V>).children.pop()!)
  }

  // ///////////////////////////////////////////////////////////////////////////
  // Internal Node: scanning & deletions //////////////////////////////////////

  // Note: `count` is the next value of the third argument to `onFound`.
  //       A leaf node's `forRange` function returns a new value for this counter,
  //       unless the operation is to stop early.
  forRange<R>(
    low: K,
    high: K,
    includeHigh: boolean | undefined,
    editMode: boolean,
    tree: BTree<K, V>,
    count: number,
    onFound?: (k: K, v: V, counter: number) => EditRangeResult<V, R> | void,
  ): EditRangeResult<V, R> | number {
    const cmp = tree._compare
    const keys = this.keys,
      children = this.children
    let iLow = this.indexOf(low, 0, cmp),
      i = iLow
    const iHigh = Math.min(
      high === low ? iLow : this.indexOf(high, 0, cmp),
      keys.length - 1,
    )
    if (!editMode) {
      // Simple case
      for (; i <= iHigh; i++) {
        const result = children[i]!.forRange(
          low,
          high,
          includeHigh,
          editMode,
          tree,
          count,
          onFound,
        )
        if (typeof result !== `number`) return result
        count = result
      }
    } else if (i <= iHigh) {
      try {
        for (; i <= iHigh; i++) {
          if (children[i]!.isShared) children[i] = children[i]!.clone()
          const result = children[i]!.forRange(
            low,
            high,
            includeHigh,
            editMode,
            tree,
            count,
            onFound,
          )
          // Note: if children[i] is empty then keys[i]=undefined.
          //       This is an invalid state, but it is fixed below.
          keys[i] = children[i]!.maxKey()!
          if (typeof result !== `number`) return result
          count = result
        }
      } finally {
        // Deletions may have occurred, so look for opportunities to merge nodes.
        const half = tree._maxNodeSize >> 1
        if (iLow > 0) iLow--
        for (i = iHigh; i >= iLow; i--) {
          if (children[i]!.keys.length <= half) {
            if (children[i]!.keys.length !== 0) {
              this.tryMerge(i, tree._maxNodeSize)
            } else {
              // child is empty! delete it!
              keys.splice(i, 1)
              children.splice(i, 1)
            }
          }
        }
        if (children.length !== 0 && children[0]!.keys.length === 0)
          check(false, `emptiness bug`)
      }
    }
    return count
  }

  /** Merges child i with child i+1 if their combined size is not too large */
  tryMerge(i: index, maxSize: number): boolean {
    const children = this.children
    if (i >= 0 && i + 1 < children.length) {
      if (children[i]!.keys.length + children[i + 1]!.keys.length <= maxSize) {
        if (children[i]!.isShared)
          // cloned already UNLESS i is outside scan range
          children[i] = children[i]!.clone()
        children[i]!.mergeSibling(children[i + 1]!, maxSize)
        children.splice(i + 1, 1)
        this.keys.splice(i + 1, 1)
        this.keys[i] = children[i]!.maxKey()!
        return true
      }
    }
    return false
  }

  /**
   * Move children from `rhs` into this.
   * `rhs` must be part of this tree, and be removed from it after this call
   * (otherwise isShared for its children could be incorrect).
   */
  mergeSibling(rhs: BNode<K, V>, maxNodeSize: number) {
    // assert !this.isShared;
    const oldLength = this.keys.length
    this.keys.push.apply(this.keys, rhs.keys)
    const rhsChildren = (rhs as any as BNodeInternal<K, V>).children
    this.children.push.apply(this.children, rhsChildren)

    if (rhs.isShared && !this.isShared) {
      // All children of a shared node are implicitly shared, and since their new
      // parent is not shared, they must now be explicitly marked as shared.
      for (const child of rhsChildren) child.isShared = true
    }

    // If our children are themselves almost empty due to a mass-delete,
    // they may need to be merged too (but only the oldLength-1 and its
    // right sibling should need this).
    this.tryMerge(oldLength - 1, maxNodeSize)
  }
}

// Optimization: this array of `undefined`s is used instead of a normal
// array of values in nodes where `undefined` is the only value.
// Its length is extended to max node size on first use; since it can
// be shared between trees with different maximums, its length can only
// increase, never decrease. Its type should be undefined[] but strangely
// TypeScript won't allow the comparison V[] === undefined[]. To prevent
// users from making this array too large, BTree has a maximum node size.
//
// FAQ: undefVals[i] is already undefined, so why increase the array size?
// Reading outside the bounds of an array is relatively slow because it
// has the side effect of scanning the prototype chain.
const undefVals: Array<any> = []

const Delete = { delete: true },
  DeleteRange = () => Delete
const EmptyLeaf = (function () {
  const n = new BNode<any, any>()
  n.isShared = true
  return n
})()
const ReusedArray: Array<any> = [] // assumed thread-local

function check(fact: boolean, ...args: Array<any>) {
  if (!fact) {
    args.unshift(`B+ tree`) // at beginning of message
    throw new Error(args.join(` `))
  }
}
