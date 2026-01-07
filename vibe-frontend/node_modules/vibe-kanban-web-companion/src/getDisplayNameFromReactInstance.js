/**
 * @typedef {import('react-reconciler').Fiber} Fiber
 * @param {Fiber} instance
 */
export function getDisplayNameForInstance(instance) {
  const { elementType, tag } = instance

  // https://github.com/facebook/react/blob/7c8e5e7ab8bb63de911637892392c5efd8ce1d0f/packages/react-reconciler/src/ReactWorkTags.js
  switch (tag) {
    case 0: // FunctionComponent
    case 1: // ClassComponent
      return (
        elementType.displayName || elementType.name || 'Anonymous Component'
      )

    case 3:
      return 'HostRoot'

    case 4:
      return 'HostPortal'

    case 5: // HostComponent:
      return elementType

    case 6: // HostText:
      return 'String'

    case 7: // Fragment
      return 'React.Fragment'

    case 8:
      return 'Mode'

    case 9: // ContextConsumer
      return 'Context.Consumer'

    case 10: // ContextProvider
      return 'Context.Provider'

    case 11: // ForwardRef
      return 'React.forwardRef'

    case 12:
      return 'Profiler'

    case 13:
      return 'SuspenseComponent'

    case 14:
      return 'MemoComponent'

    case 15: // SimpleMemoComponent
      // Attempt to get name from wrapped component
      return elementType.type.name ?? 'MemoComponent'

    case 16: // LazyComponent
      return 'React.lazy'

    case 17:
      return 'IncompleteClassComponent'

    case 18:
      return 'DehydratedFragment'

    case 19:
      return 'SuspenseListComponent'

    case 21:
      return 'ScopeComponent'

    case 22:
      return 'OffscreenComponent'

    case 23:
      return 'LegacyHiddenComponent'

    case 24:
      return 'CacheComponent'

    // @ts-expect-error Type '25' is not comparable to type 'WorkTag'.ts(2678)
    case 25:
      return 'TracingMarkerComponent'

    // @ts-expect-error Type '26' is not comparable to type 'WorkTag'.ts(2678)
    case 26:
      return 'HostHoistable'

    // @ts-expect-error Type '27' is not comparable to type 'WorkTag'.ts(2678)
    case 27:
      return 'HostSingleton'

    // @ts-expect-error Type '28' is not comparable to type 'WorkTag'.ts(2678)
    case 28:
      return 'IncompleteFunctionComponent'

    // @ts-expect-error Type '29' is not comparable to type 'WorkTag'.ts(2678)
    case 29:
      return 'Throw'

    default:
      console.warn(`Unrecognized React Fiber tag: ${tag}`, instance)
      return 'Unknown Component'
  }
}
