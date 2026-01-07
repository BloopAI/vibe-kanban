import type {
  $OmitArrayKeys,
  $PreservedValue,
  $Dictionary,
  $SpecialObject,
  $StringKeyPathToRecord,
  $NoInfer,
  $Prune,
  $Turtles,
} from './helpers.js';
import type {
  TypeOptions,
  Namespace,
  FlatNamespace,
  DefaultNamespace,
  TOptions,
  TOptionsBase,
} from './options.js';

/** @todo consider to replace {} with Record<string, never> */
/* eslint @typescript-eslint/ban-types: ['error', { types: { "{}": false } }] */

// Type Options
type _ReturnObjects = TypeOptions['returnObjects'];
type _ReturnEmptyString = TypeOptions['returnEmptyString'];
type _ReturnNull = TypeOptions['returnNull'];
type _KeySeparator = TypeOptions['keySeparator'];
type _NsSeparator = TypeOptions['nsSeparator'];
type _PluralSeparator = TypeOptions['pluralSeparator'];
type _ContextSeparator = TypeOptions['contextSeparator'];
type _FallbackNamespace = TypeOptions['fallbackNS'];
type _Resources = TypeOptions['resources'];
type _CompatibilityJSON = TypeOptions['compatibilityJSON'];
type _InterpolationPrefix = TypeOptions['interpolationPrefix'];
type _InterpolationSuffix = TypeOptions['interpolationSuffix'];
type _UnescapePrefix = TypeOptions['unescapePrefix'];
type _UnescapeSuffix = TypeOptions['unescapeSuffix'];
type _StrictKeyChecks = TypeOptions['strictKeyChecks'];
type _EnableSelector = TypeOptions['enableSelector'];

type $IsResourcesDefined = [keyof _Resources] extends [never] ? false : true;
type $ValueIfResourcesDefined<Value, Fallback> = $IsResourcesDefined extends true
  ? Value
  : Fallback;
type $FirstNamespace<Ns extends Namespace> = Ns extends readonly any[] ? Ns[0] : Ns;

type Resources = $ValueIfResourcesDefined<_Resources, $Dictionary<string>>;

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

type WithOrWithoutPlural<Key> = _CompatibilityJSON extends 'v4'
  ? Key extends `${infer KeyWithoutOrdinalPlural}${_PluralSeparator}ordinal${_PluralSeparator}${PluralSuffix}`
    ? KeyWithoutOrdinalPlural | Key
    : Key extends `${infer KeyWithoutPlural}${_PluralSeparator}${PluralSuffix}`
      ? KeyWithoutPlural | Key
      : Key
  : Key;

type JoinKeys<K1, K2> = `${K1 & string}${_KeySeparator}${K2 & string}`;
type AppendNamespace<Ns, Keys> = `${Ns & string}${_NsSeparator}${Keys & string}`;

type TrimSpaces<T extends string, Acc extends string = ''> = T extends `${infer Char}${infer Rest}`
  ? Char extends ' '
    ? TrimSpaces<Rest, Acc>
    : TrimSpaces<Rest, `${Acc}${Char}`>
  : T extends ''
    ? Acc
    : never;

interface Branded<Ns extends Namespace> {
  $TFunctionBrand: $IsResourcesDefined extends true
    ? `${Ns extends readonly any[] ? Ns[0] : Ns}`
    : never;
}

/** ****************************************************
 * Build all keys and key prefixes based on Resources *
 ***************************************************** */
type KeysBuilderWithReturnObjects<Res, Key = keyof Res> = Key extends keyof Res
  ? Res[Key] extends $Dictionary | readonly unknown[]
    ?
        | JoinKeys<Key, WithOrWithoutPlural<keyof $OmitArrayKeys<Res[Key]>>>
        | JoinKeys<Key, KeysBuilderWithReturnObjects<Res[Key]>>
    : never
  : never;

type KeysBuilderWithoutReturnObjects<Res, Key = keyof $OmitArrayKeys<Res>> = Key extends keyof Res
  ? Res[Key] extends $Dictionary | readonly unknown[]
    ? JoinKeys<Key, KeysBuilderWithoutReturnObjects<Res[Key]>>
    : Key
  : never;

type KeysBuilder<Res, WithReturnObjects> = $IsResourcesDefined extends true
  ? WithReturnObjects extends true
    ? keyof Res | KeysBuilderWithReturnObjects<Res>
    : KeysBuilderWithoutReturnObjects<Res>
  : string;

type KeysWithReturnObjects = {
  [Ns in FlatNamespace]: WithOrWithoutPlural<KeysBuilder<Resources[Ns], true>>;
};
type KeysWithoutReturnObjects = {
  [Ns in FlatNamespace]: WithOrWithoutPlural<KeysBuilder<Resources[Ns], false>>;
};

type ResourceKeys<WithReturnObjects = _ReturnObjects> = WithReturnObjects extends true
  ? KeysWithReturnObjects
  : KeysWithoutReturnObjects;

/** **********************************************************************
 * Parse t function keys based on the namespace, options and key prefix *
 *********************************************************************** */
export type KeysByTOptions<TOpt extends TOptions> = TOpt['returnObjects'] extends true
  ? ResourceKeys<true>
  : ResourceKeys;

export type NsByTOptions<Ns extends Namespace, TOpt extends TOptions> = TOpt['ns'] extends Namespace
  ? TOpt['ns']
  : Ns;

type ParseKeysByKeyPrefix<Keys, KPrefix> = KPrefix extends string
  ? Keys extends `${KPrefix}${_KeySeparator}${infer Key}`
    ? Key
    : never
  : Keys;

type ParseKeysByNamespaces<Ns extends Namespace, Keys> = Ns extends readonly (infer UnionNsps)[]
  ? UnionNsps extends keyof Keys
    ? AppendNamespace<UnionNsps, Keys[UnionNsps]>
    : never
  : never;

type ParseKeysByFallbackNs<Keys extends $Dictionary> = _FallbackNamespace extends false
  ? never
  : _FallbackNamespace extends (infer UnionFallbackNs extends string)[]
    ? Keys[UnionFallbackNs]
    : Keys[_FallbackNamespace & string];

export type FilterKeysByContext<Keys, Context> = Context extends string
  ? Keys extends
      | `${infer Prefix}${_ContextSeparator}${Context}${_PluralSeparator}${PluralSuffix}`
      | `${infer Prefix}${_ContextSeparator}${Context}`
    ? Prefix
    : never
  : Keys;

export type ParseKeys<
  Ns extends Namespace = DefaultNamespace,
  TOpt extends TOptions = {},
  KPrefix = undefined,
  Keys extends $Dictionary = KeysByTOptions<TOpt>,
  ActualNS extends Namespace = NsByTOptions<Ns, TOpt>,
  Context extends TOpt['context'] = TOpt['context'],
> = $IsResourcesDefined extends true
  ? FilterKeysByContext<
      | ParseKeysByKeyPrefix<Keys[$FirstNamespace<ActualNS>], KPrefix>
      | ParseKeysByNamespaces<ActualNS, Keys>
      | ParseKeysByFallbackNs<Keys>,
      Context
    >
  : string;

/** *******************************************************
 * Parse t function return type and interpolation values *
 ******************************************************** */
type ParseActualValue<Ret> = Ret extends `${_UnescapePrefix}${infer ActualValue}${_UnescapeSuffix}`
  ? TrimSpaces<ActualValue>
  : Ret;

type ParseInterpolationValues<Ret> =
  Ret extends `${string}${_InterpolationPrefix}${infer Value}${_InterpolationSuffix}${infer Rest}`
    ?
        | (Value extends `${infer ActualValue},${string}`
            ? ParseActualValue<ActualValue>
            : ParseActualValue<Value>)
        | ParseInterpolationValues<Rest>
    : never;

export type InterpolationMap<Ret> = $PreservedValue<
  $StringKeyPathToRecord<ParseInterpolationValues<Ret>, unknown>,
  Record<string, unknown>
>;

type ParseTReturnPlural<
  Res,
  Key,
  KeyWithPlural = `${Key & string}${_PluralSeparator}${PluralSuffix}`,
> = Res[(KeyWithPlural | Key) & keyof Res];

type ParseTReturnPluralOrdinal<
  Res,
  Key,
  KeyWithOrdinalPlural = `${Key &
    string}${_PluralSeparator}ordinal${_PluralSeparator}${PluralSuffix}`,
> = Res[(KeyWithOrdinalPlural | Key) & keyof Res];

type ParseTReturnWithFallback<Key, Val> = Val extends ''
  ? _ReturnEmptyString extends true
    ? ''
    : Key
  : Val extends null
    ? _ReturnNull extends true
      ? null
      : Key
    : Val;

type ParseTReturn<Key, Res, TOpt extends TOptions = {}> = ParseTReturnWithFallback<
  Key,
  Key extends `${infer K1}${_KeySeparator}${infer RestKey}`
    ? ParseTReturn<RestKey, Res[K1 & keyof Res], TOpt>
    : // Process plurals only if count is provided inside options
      TOpt['count'] extends number
      ? TOpt['ordinal'] extends boolean
        ? ParseTReturnPluralOrdinal<Res, Key>
        : ParseTReturnPlural<Res, Key>
      : // otherwise access plain key without adding plural and ordinal suffixes
        Res extends readonly unknown[]
        ? Key extends `${infer NKey extends number}`
          ? Res[NKey]
          : never
        : Res[Key & keyof Res]
>;

type TReturnOptionalNull = _ReturnNull extends true ? null : never;
type TReturnOptionalObjects<TOpt extends { returnObjects?: unknown }> = _ReturnObjects extends true
  ? $SpecialObject | string
  : TOpt['returnObjects'] extends true
    ? $SpecialObject
    : string;
type DefaultTReturn<TOpt extends { returnObjects?: unknown }> =
  | TReturnOptionalObjects<TOpt>
  | TReturnOptionalNull;

export type KeyWithContext<Key, TOpt extends TOptions> = TOpt['context'] extends string
  ? `${Key & string}${_ContextSeparator}${TOpt['context']}`
  : Key;

export type TFunctionReturn<
  Ns extends Namespace,
  Key,
  TOpt extends TOptions,
  ActualNS extends Namespace = NsByTOptions<Ns, TOpt>,
  ActualKey = KeyWithContext<Key, TOpt>,
> = $IsResourcesDefined extends true
  ? ActualKey extends `${infer Nsp}${_NsSeparator}${infer RestKey}`
    ? ParseTReturn<RestKey, Resources[Nsp & keyof Resources], TOpt>
    : ParseTReturn<ActualKey, Resources[$FirstNamespace<ActualNS>], TOpt>
  : DefaultTReturn<TOpt>;

export type TFunctionDetailedResult<T = string, TOpt extends TOptions = {}> = {
  /**
   * The plain used key
   */
  usedKey: string;
  /**
   * The translation result.
   */
  res: T;
  /**
   * The key with context / plural
   */
  exactUsedKey: string;
  /**
   * The used language for this translation.
   */
  usedLng: string;
  /**
   * The used namespace for this translation.
   */
  usedNS: string;
  /**
   * The parameters used for interpolation.
   */
  usedParams: InterpolationMap<T> & { count?: TOpt['count'] };
};

type TFunctionProcessReturnValue<Ret, DefaultValue> = Ret extends string | $SpecialObject | null
  ? Ret
  : [DefaultValue] extends [never]
    ? Ret
    : DefaultValue;

type TFunctionReturnOptionalDetails<Ret, TOpt extends TOptions> = TOpt['returnDetails'] extends true
  ? TFunctionDetailedResult<Ret, TOpt>
  : Ret;

type AppendKeyPrefix<Key, KPrefix> = KPrefix extends string
  ? `${KPrefix}${_KeySeparator}${Key & string}`
  : Key;

/** ************************
 * T function declaration *
 ************************* */

interface TFunctionStrict<Ns extends Namespace = DefaultNamespace, KPrefix = undefined>
  extends Branded<Ns> {
  <
    const Key extends ParseKeys<Ns, TOpt, KPrefix> | TemplateStringsArray,
    const TOpt extends TOptions,
    Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, KPrefix>, TOpt>,
  >(
    key: Key | Key[],
    options?: TOpt & InterpolationMap<Ret>,
  ): TFunctionReturnOptionalDetails<TFunctionProcessReturnValue<$NoInfer<Ret>, never>, TOpt>;
  <
    const Key extends ParseKeys<Ns, TOpt, KPrefix> | TemplateStringsArray,
    const TOpt extends TOptions,
    Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, KPrefix>, TOpt>,
  >(
    key: Key | Key[],
    defaultValue: string,
    options?: TOpt & InterpolationMap<Ret>,
  ): TFunctionReturnOptionalDetails<TFunctionProcessReturnValue<$NoInfer<Ret>, never>, TOpt>;
}

interface TFunctionNonStrict<Ns extends Namespace = DefaultNamespace, KPrefix = undefined>
  extends Branded<Ns> {
  <
    const Key extends ParseKeys<Ns, TOpt, KPrefix> | TemplateStringsArray,
    const TOpt extends TOptions,
    Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, KPrefix>, TOpt>,
    const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt & InterpolationMap<Ret>,
    DefaultValue extends string = never,
  >(
    ...args:
      | [key: Key | Key[], options?: ActualOptions]
      | [key: string | string[], options: TOpt & $Dictionary & { defaultValue: DefaultValue }]
      | [key: string | string[], defaultValue: DefaultValue, options?: TOpt & $Dictionary]
  ): TFunctionReturnOptionalDetails<TFunctionProcessReturnValue<$NoInfer<Ret>, DefaultValue>, TOpt>;
}

type TFunctionSignature<
  Ns extends Namespace = DefaultNamespace,
  KPrefix = undefined,
> = _EnableSelector extends true | 'optimize'
  ? TFunctionSelector<Ns, KPrefix, GetSource<Ns, KPrefix>>
  : _StrictKeyChecks extends true
    ? TFunctionStrict<Ns, KPrefix>
    : TFunctionNonStrict<Ns, KPrefix>;

export interface TFunction<Ns extends Namespace = DefaultNamespace, KPrefix = undefined>
  extends TFunctionSignature<Ns, KPrefix> {}

export type KeyPrefix<Ns extends Namespace> = ResourceKeys<true>[$FirstNamespace<Ns>] | undefined;

/// ////////////// ///
///  ↆ selector ↆ  ///
/// ////////////// ///

interface TFunctionSelector<Ns extends Namespace, KPrefix, Source> extends Branded<Ns> {
  <
    Target extends ConstrainTarget<Opts>,
    const Opts extends SelectorOptions<NewNs>,
    NewNs extends Namespace,
    NewSrc extends GetSource<NewNs, KPrefix>,
  >(
    selector: SelectorFn<NewSrc, ApplyTarget<Target, Opts>, Opts>,
    options: Opts & InterpolationMap<Target> & { ns: NewNs },
  ): SelectorReturn<Target, Opts>;
  <Target extends ConstrainTarget<Opts>, const Opts extends SelectorOptions<Ns>>(
    selector: SelectorFn<Source, ApplyTarget<Target, Opts>, Opts>,
    options?: Opts & InterpolationMap<Target>,
  ): SelectorReturn<Target, Opts>;
}

interface SelectorOptions<Ns = Namespace>
  extends Omit<TOptionsBase, 'ns' | 'nsSeparator'>,
    $Dictionary {
  ns?: Ns;
}

type SelectorReturn<
  Target,
  Opts extends { defaultValue?: unknown; returnObjects?: boolean },
> = $IsResourcesDefined extends true
  ? TFunctionReturnOptionalDetails<ProcessReturnValue<Target, Opts['defaultValue']>, Opts>
  : DefaultTReturn<Opts>;

interface SelectorFn<Source, Target, Opts extends SelectorOptions<unknown>> {
  (translations: Select<Source, Opts['context']>): Target;
}

type ApplyKeyPrefix<
  T extends [any],
  KPrefix,
> = KPrefix extends `${infer Head}${_KeySeparator}${infer Tail}`
  ? ApplyKeyPrefix<[T[0][Head]], Tail>
  : T[0][KPrefix & string];

type ApplyTarget<
  Target,
  Opts extends { returnObjects?: unknown },
> = Opts['returnObjects'] extends true ? unknown : Target;

type ConstrainTarget<Opts extends SelectorOptions<any>> = _ReturnObjects extends true
  ? unknown
  : Opts['returnObjects'] extends true
    ? unknown
    : $IsResourcesDefined extends false
      ? unknown
      : string;

type ProcessReturnValue<Target, DefaultValue> = $Turtles extends Target
  ? string
  : [DefaultValue] extends [never]
    ? Target
    : unknown extends DefaultValue
      ? Target
      : Target | DefaultValue;

type PickNamespaces<T, K extends keyof any> = {
  [P in K as P extends keyof T ? P : never]: T[P & keyof T];
};

type GetSource<
  Ns extends Namespace,
  KPrefix,
  Res = Ns extends readonly [keyof Resources, any, ...any]
    ? Resources[Ns[0]] & PickNamespaces<Resources, Ns[number]>
    : Resources[$FirstNamespace<Ns>],
> = KPrefix extends keyof Res
  ? Res[KPrefix]
  : undefined extends KPrefix
    ? Res
    : ApplyKeyPrefix<[Res], KPrefix>;

type Select<T, Context> = $IsResourcesDefined extends false
  ? $Turtles
  : [_EnableSelector] extends ['optimize']
    ? T
    : FilterKeys<T, Context>;

type FilterKeys<T, Context> = never | T extends readonly any[]
  ? { [I in keyof T]: FilterKeys<T[I], Context> }
  : $Prune<
      {
        [K in keyof T as T[K] extends object
          ? K
          : Context extends string
            ? never
            : K extends `${string}${_PluralSeparator}${PluralSuffix}`
              ? never
              : K]: T[K] extends object ? FilterKeys<T[K], Context> : T[K];
      } & {
        [K in keyof T as T[K] extends object
          ? never
          : Context extends string
            ? never
            : K extends
                  | `${infer Prefix}${_PluralSeparator}${PluralSuffix}`
                  | `${infer Prefix}${_PluralSeparator}ordinal${_PluralSeparator}${PluralSuffix}`
              ? Prefix
              : never]: T[K] extends object ? FilterKeys<T[K], Context> : T[K];
      } & {
        [K in keyof T as T[K] extends object
          ? never
          : Context extends string
            ? K extends
                | `${infer Prefix}${_ContextSeparator}${Context}`
                | `${infer Prefix}${_ContextSeparator}${Context}${_PluralSeparator}${PluralSuffix}`
              ? Prefix
              : never
            : never]: T[K] extends object ? FilterKeys<T[K], Context> : T[K];
      }
    >;
