
/** Read-only set interface (subinterface of IMapSource<K,any>).
 *  The word "set" usually means that each item in the collection is unique
 *  (appears only once, based on a definition of equality used by the 
 *  collection.) Objects conforming to this interface aren't guaranteed not 
 *  to contain duplicates, but as an example, BTree<K,V> implements this 
 *  interface and does not allow duplicates. */
export interface ISetSource<K=any>
{
  /** Returns the number of key/value pairs in the map object. */
  size: number;
  /** Returns a boolean asserting whether the key exists in the map object or not. */
  has(key: K): boolean;
  /** Returns a new iterator for iterating the items in the set (the order is implementation-dependent). */
  keys(): IterableIterator<K>;
}

/** Read-only map interface (i.e. a source of key-value pairs). */
export interface IMapSource<K=any, V=any> extends ISetSource<K>
{
  /** Returns the number of key/value pairs in the map object. */
  size: number;
  /** Returns the value associated to the key, or undefined if there is none. */
  get(key: K): V|undefined;
  /** Returns a boolean asserting whether the key exists in the map object or not. */
  has(key: K): boolean;
  /** Calls callbackFn once for each key-value pair present in the map object.
   *  The ES6 Map class sends the value to the callback before the key, so
   *  this interface must do likewise. */
  forEach(callbackFn: (v:V, k:K, map:IMapSource<K,V>) => void, thisArg: any): void;
  
  /** Returns an iterator that provides all key-value pairs from the collection (as arrays of length 2). */
  entries(): IterableIterator<[K,V]>;
  /** Returns a new iterator for iterating the keys of each pair. */
  keys(): IterableIterator<K>;
  /** Returns a new iterator for iterating the values of each pair. */
  values(): IterableIterator<V>;
  // TypeScript compiler decided Symbol.iterator has type 'any'
  //[Symbol.iterator](): IterableIterator<[K,V]>;
}

/** Write-only set interface (the set cannot be queried, but items can be added to it.) 
 *  @description Note: BTree<K,V> does not officially implement this interface,
 *               but BTree<K> can be used as an instance of ISetSink<K>. */
export interface ISetSink<K=any>
{
  /** Adds the specified item to the set, if it was not in the set already. */
  add(key: K): any;
  /** Returns true if an element in the map object existed and has been 
   *  removed, or false if the element did not exist. */
  delete(key: K): boolean;
  /** Removes everything so that the set is empty. */
  clear(): void;
}

/** Write-only map interface (i.e. a drain into which key-value pairs can be "sunk") */
export interface IMapSink<K=any, V=any>
{
  /** Returns true if an element in the map object existed and has been 
   *  removed, or false if the element did not exist. */
  delete(key: K): boolean;
  /** Sets the value for the key in the map object (the return value is 
   *  boolean in BTree but Map returns the Map itself.) */
  set(key: K, value: V): any;
  /** Removes all key/value pairs from the IMap object. */
  clear(): void;
}

/** Set interface.
 *  @description Note: BTree<K,V> does not officially implement this interface,
 *               but BTree<K> can be used as an instance of ISet<K>. */
export interface ISet<K=any> extends ISetSource<K>, ISetSink<K> { }

/** An interface compatible with ES6 Map and BTree. This interface does not
 *  describe the complete interface of either class, but merely the common 
 *  interface shared by both. */
export interface IMap<K=any, V=any> extends IMapSource<K, V>, IMapSink<K, V> { }

/** An data source that provides read-only access to a set of items called
 *  "keys" in sorted order. This is a subinterface of ISortedMapSource. */
export interface ISortedSetSource<K=any> extends ISetSource<K>
{
  /** Gets the lowest key in the collection. */
  minKey(): K | undefined;
  /** Gets the highest key in the collection. */
  maxKey(): K | undefined;
  /** Returns the next key larger than the specified key (or undefined if there is none).
   *  Also, nextHigherKey(undefined) returns the lowest key. */
  nextHigherKey(key?: K): K|undefined;
  /** Returns the next key smaller than the specified key (or undefined if there is none).
   *  Also, nextLowerKey(undefined) returns the highest key. */
  nextLowerKey(key?: K): K|undefined;
  /** Calls `callback` on the specified range of keys, in ascending order by key.
   * @param low The first key scanned will be greater than or equal to `low`.
   * @param high Scanning stops when a key larger than this is reached.
   * @param includeHigh If the `high` key is present in the map, `onFound` is called 
   *        for that final pair if and only if this parameter is true.
   * @param onFound A function that is called for each key pair. Because this
   *        is a subinterface of ISortedMapSource, if there is a value 
   *        associated with the key, it is passed as the second parameter.
   * @param initialCounter Initial third argument of `onFound`. This value 
   *        increases by one each time `onFound` is called. Default: 0
   * @returns Number of pairs found and the number of times `onFound` was called.
   */
  forRange(low: K, high: K, includeHigh: boolean, onFound?: (k:K,v:any,counter:number) => void, initialCounter?: number): number;
  /** Returns a new iterator for iterating the keys of each pair in ascending order. 
   *  @param firstKey: Minimum key to include in the output. */
  keys(firstKey?: K): IterableIterator<K>;
}

/** An data source that provides read-only access to items in sorted order. */
export interface ISortedMapSource<K=any, V=any> extends IMapSource<K, V>, ISortedSetSource<K>
{
  /** Returns the next pair whose key is larger than the specified key (or undefined 
   *  if there is none). If key === undefined, this function returns the lowest pair. */
  nextHigherPair(key?: K): [K,V]|undefined;
  /** Returns the next pair whose key is smaller than the specified key (or undefined
   *  if there is none). If key === undefined, this function returns the highest pair. */
  nextLowerPair(key?: K): [K,V]|undefined;
  /** Builds an array of pairs from the specified range of keys, sorted by key.
   * Each returned pair is also an array: pair[0] is the key, pair[1] is the value.
   * @param low The first key in the array will be greater than or equal to `low`.
   * @param high This method returns when a key larger than this is reached.
   * @param includeHigh If the `high` key is present in the map, its pair will be
   *        included in the output if and only if this parameter is true. Note: 
   *        if the `low` key is present, it is always included in the output.
   * @param maxLength Maximum length of the returned array (default: unlimited)
   * @description Computational complexity: O(result.length + log size)
   */
  getRange(low: K, high: K, includeHigh?: boolean, maxLength?: number): [K,V][];
  /** Calls `callback` on the specified range of keys, in ascending order by key.
   * @param low The first key scanned will be greater than or equal to `low`.
   * @param high Scanning stops when a key larger than this is reached.
   * @param includeHigh If the `high` key is present in the map, `onFound` is called 
   *        for that final pair if and only if this parameter is true.
   * @param onFound A function that is called for each key-value pair.
   * @param initialCounter Initial third argument of onFound. This value 
   *        increases by one each time `onFound` is called. Default: 0
   * @returns Number of pairs found and the number of times `callback` was called.
   */
  forRange(low: K, high: K, includeHigh: boolean, onFound?: (k:K,v:V,counter:number) => void, initialCounter?: number): number;
  /** Returns an iterator that provides items in order by key.
   *  @param firstKey: Minimum key to include in the output. */
  entries(firstKey?: K): IterableIterator<[K,V]>;
  /** Returns a new iterator for iterating the keys of each pair in ascending order. 
   *  @param firstKey: Minimum key to include in the output. */
  keys(firstKey?: K): IterableIterator<K>;
  /** Returns a new iterator for iterating the values of each pair in order by key. 
   *  @param firstKey: Minimum key whose associated value is included in the output. */
  values(firstKey?: K): IterableIterator<V>;
  
  // This method should logically be in IMapSource but is not supported by ES6 Map
  /** Performs a reduce operation like the `reduce` method of `Array`. 
   *  It is used to combine all pairs into a single value, or perform conversions. */
  reduce<R>(callback: (previous:R,currentPair:[K,V],counter:number,tree:IMapF<K,V>) => R, initialValue: R): R;
  /** Performs a reduce operation like the `reduce` method of `Array`. 
   *  It is used to combine all pairs into a single value, or perform conversions. */
  reduce<R>(callback: (previous:R|undefined,currentPair:[K,V],counter:number,tree:IMapF<K,V>) => R): R|undefined;
}

/** An interface for a set of keys (the combination of ISortedSetSource<K> and ISetSink<K>) */
export interface ISortedSet<K=any> extends ISortedSetSource<K>, ISetSink<K> { }

/** An interface for a sorted map (dictionary), 
 *  not including functional/persistent methods. */
export interface ISortedMap<K=any, V=any> extends IMap<K,V>, ISortedMapSource<K, V>
{
  // All of the following methods should be in IMap but are left out of IMap
  // so that IMap is compatible with ES6 Map.

  /** Adds or overwrites a key-value pair in the sorted map.
   * @param key the key is used to determine the sort order of data in the tree.
   * @param value data to associate with the key
   * @param overwrite Whether to overwrite an existing key-value pair 
   *        (default: true). If this is false and there is an existing
   *        key-value pair then the call to this method has no effect.
   * @returns true if a new key-value pair was added, false if the key 
   *        already existed. */
  set(key: K, value: V, overwrite?: boolean): boolean;
  /** Adds all pairs from a list of key-value pairs.
   * @param pairs Pairs to add to this tree. If there are duplicate keys, 
   *        later pairs currently overwrite earlier ones (e.g. [[0,1],[0,7]] 
   *        associates 0 with 7.)
   * @param overwrite Whether to overwrite pairs that already exist (if false,
   *        pairs[i] is ignored when the key pairs[i][0] already exists.)
   * @returns The number of pairs added to the collection.
   */
  setPairs(pairs: [K,V][], overwrite?: boolean): number;
  /** Deletes a series of keys from the collection. */
  deleteKeys(keys: K[]): number;
  /** Removes a range of key-value pairs from the B+ tree.
   * @param low The first key deleted will be greater than or equal to `low`.
   * @param high Deleting stops when a key larger than this is reached.
   * @param includeHigh Specifies whether the `high` key, if present, is deleted.
   * @returns The number of key-value pairs that were deleted. */
  deleteRange(low: K, high: K, includeHigh: boolean): number;

  // TypeScript requires these methods of ISortedMapSource to be repeated
  entries(firstKey?: K): IterableIterator<[K,V]>;
  keys(firstKey?: K): IterableIterator<K>;
  values(firstKey?: K): IterableIterator<V>;
}

/** An interface for a functional set, in which the set object could be read-only 
 *  but new versions of the set can be created by calling "with" or "without" 
 *  methods to add or remove keys. This is a subinterface of IMapF<K,V>,
 *  so the items in the set may be referred to as "keys". */
export interface ISetF<K=any> extends ISetSource<K> {
  /** Returns a copy of the set with the specified key included. 
   *  @description You might wonder why this method accepts only one key 
   *  instead of `...keys: K[]`. The reason is that the derived interface
   *  IMapF expects the second parameter to be a value. Therefore
   *  withKeys() is provided to set multiple keys at once. */
  with(key: K): ISetF<K>;
  /** Returns a copy of the set with the specified key removed. */
  without(key: K): ISetF<K>;
  /** Returns a copy of the tree with all the keys in the specified array present.
   *  @param keys The keys to add.
   *  @param returnThisIfUnchanged If true, the method returns `this` when
   *         all of the keys are already present in the collection. The 
   *         default value may be true or false depending on the concrete
   *         implementation of the interface (in BTree, the default is false.) */
  withKeys(keys: K[], returnThisIfUnchanged?: boolean): ISetF<K>;
  /** Returns a copy of the tree with all the keys in the specified array removed. */
  withoutKeys(keys: K[], returnThisIfUnchanged?: boolean): ISetF<K>;
  /** Returns a copy of the tree with items removed whenever the callback 
   *  function returns false.
   *  @param callback A function to call for each item in the set.
   *         The second parameter to `callback` exists because ISetF
   *         is a subinterface of IMapF. If the object is a map, v
   *         is the value associated with the key, otherwise v could be
   *         undefined or another copy of the third parameter (counter). */
  filter(callback: (k:K,v:any,counter:number) => boolean, returnThisIfUnchanged?: boolean): ISetF<K>;
}

/** An interface for a functional map, in which the map object could be read-only
 *  but new versions of the map can be created by calling "with" or "without" 
 *  methods to add or remove keys or key-value pairs. 
 */
export interface IMapF<K=any, V=any> extends IMapSource<K, V>, ISetF<K> {
  /** Returns a copy of the tree with the specified key set (the value is undefined). */
  with(key: K): IMapF<K,V|undefined>;
  /** Returns a copy of the tree with the specified key-value pair set. */
  with<V2>(key: K, value: V2, overwrite?: boolean): IMapF<K,V|V2>;
  /** Returns a copy of the tree with the specified key-value pairs set. */
  withPairs<V2>(pairs: [K,V|V2][], overwrite: boolean): IMapF<K,V|V2>;
  /** Returns a copy of the tree with all the keys in the specified array present.
   *  @param keys The keys to add. If a key is already present in the tree,
   *         neither the existing key nor the existing value is modified. 
   *  @param returnThisIfUnchanged If true, the method returns `this` when
   *         all of the keys are already present in the collection. The 
   *         default value may be true or false depending on the concrete
   *         implementation of the interface (in BTree, the default is false.) */
  withKeys(keys: K[], returnThisIfUnchanged?: boolean): IMapF<K,V|undefined>;
  /** Returns a copy of the tree with all values altered by a callback function. */
  mapValues<R>(callback: (v:V,k:K,counter:number) => R): IMapF<K,R>;
  /** Performs a reduce operation like the `reduce` method of `Array`. 
   *  It is used to combine all pairs into a single value, or perform conversions. */
  reduce<R>(callback: (previous:R,currentPair:[K,V],counter:number,tree:IMapF<K,V>) => R, initialValue: R): R;
  /** Performs a reduce operation like the `reduce` method of `Array`. 
   *  It is used to combine all pairs into a single value, or perform conversions. */
  reduce<R>(callback: (previous:R|undefined,currentPair:[K,V],counter:number,tree:IMapF<K,V>) => R): R|undefined;

  // Update return types in ISetF
  without(key: K): IMapF<K,V>;
  withoutKeys(keys: K[], returnThisIfUnchanged?: boolean): IMapF<K,V>;
  /** Returns a copy of the tree with pairs removed whenever the callback 
   *  function returns false. */
  filter(callback: (k:K,v:V,counter:number) => boolean, returnThisIfUnchanged?: boolean): IMapF<K,V>;
}

/** An interface for a functional sorted set: a functional set in which the 
 *  keys (items) are sorted. This is a subinterface of ISortedMapF. */
export interface ISortedSetF<K=any> extends ISetF<K>, ISortedSetSource<K>
{
  // TypeScript requires this method of ISortedSetSource to be repeated
  keys(firstKey?: K): IterableIterator<K>;
}

export interface ISortedMapF<K=any,V=any> extends ISortedSetF<K>, IMapF<K,V>, ISortedMapSource<K,V>
{
  /** Returns a copy of the tree with the specified range of keys removed. */
  withoutRange(low: K, high: K, includeHigh: boolean, returnThisIfUnchanged?: boolean): ISortedMapF<K,V>;

  // TypeScript requires these methods of ISortedSetF and ISortedMapSource to be repeated
  entries(firstKey?: K): IterableIterator<[K,V]>;
  keys(firstKey?: K): IterableIterator<K>;
  values(firstKey?: K): IterableIterator<V>;
  forRange(low: K, high: K, includeHigh: boolean, onFound?: (k:K,v:V,counter:number) => void, initialCounter?: number): number;

  // Update the return value of methods from base interfaces
  with(key: K): ISortedMapF<K,V|undefined>;
  with<V2>(key: K, value: V2, overwrite?: boolean): ISortedMapF<K,V|V2>;
  withKeys(keys: K[], returnThisIfUnchanged?: boolean): ISortedMapF<K,V|undefined>;
  withPairs<V2>(pairs: [K,V|V2][], overwrite: boolean): ISortedMapF<K,V|V2>;
  mapValues<R>(callback: (v:V,k:K,counter:number) => R): ISortedMapF<K,R>;
  without(key: K): ISortedMapF<K,V>;
  withoutKeys(keys: K[], returnThisIfUnchanged?: boolean): ISortedMapF<K,V>;
  filter(callback: (k:K,v:any,counter:number) => boolean, returnThisIfUnchanged?: boolean): ISortedMapF<K,V>;
}

export interface ISortedMapConstructor<K,V> {
    new (entries?: [K,V][], compare?: (a: K, b: K) => number): ISortedMap<K,V>;
}
export interface ISortedMapFConstructor<K,V> {
    new (entries?: [K,V][], compare?: (a: K, b: K) => number): ISortedMapF<K,V>;
}
