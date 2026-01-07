# Push-based state management

Welcome to the README of Gurx, an typescript-native reactive state management library for complex web applications and components that do not have the symmetry of the store object and the component tree.

## Why should you consider Gurx?

- **Push-based recalculation model**. Unlike the regular, "pull", imperative state recalculation model. Gurx uses a push-based model, where data flows through pipes described with functional operators. Among other benefits, this lets you publish values into multiple nodes **and** subscribe for changes in multiple nodes simultaneously, reducing the amount of UI re-renders.

- **Open and Extendable**. The cell/signal definition approach lets you extend the logic of the state management by connecting more nodes and interactions to the existing ones in multiple modules. This lets you design your state management as smaller distributed pieces and even build a plugin system on top of it.

- **Optimized**. The Gurx nodes are distinct by default. A distinct node pushes through its subscribers only when a value different than the previous one is published. This allows you to avoid expensive computations and re-renders.

- **Type-safe**. cells and signals are typed and carry the right value types through the node operators and the React hooks that refer them.

- **Testable**. You can easily initiate a realm and interact with your nodes outside of React. This makes it easy to unit-test your state management logic.

- **React friendly**. Gurx ships a Realm provider component and set of hooks that let you access the values and publish new values in the given nodes. Under the hood, the hooks use `useSyncExternalStore`.

## Conceptual Overview

The library is based on the concept of node **definitions**, which are instantiated into **nodes** in a graph-based structure called a **Realm**. The nodes are connected through **dependencies** and **transformations** that describe how the values that flow through the nodes map and transform.

### Cells, Signals, and Actions

Gurx has three types of node definitions: **cells**, **signals**, and **actions**. The cells are stateful, which means that the values that flow through them are stored in the realm between computations. The signals are stateless cells; you can publish a value through a signal that will trigger the specified computations and you can subscribe to signal updates, but you can't query the current value of a signal.

Finally, actions are value-less signals - they are meant to trigger some recalculation without a parameter.

### The Realm

The cells, signals, and actions are just blueprints **and** references to nodes in a realm. The actual instantiation and interaction (publishing, subscribing, etc.) happens through a Realm instance. A realm is initially empty; it creates its node instances when you subscribe or publish to a cell/signal through the realm's methods. If a cell/signal refers to other nodes in its initialization function, the realm will automatically recursively include those nodes as well.

A cell/signal has a single instance in a realm that has referred to it. If you subscribe to a cell/signal multiple times, the realm will operate on the same instance. In practice, you don't have to care about the difference between a node instance and a definition.

## Installation

Gurx is distributed as an NPM package. Install it with NPM or any of its fancier replacements. Every function and class from the samples is a named export from it. The package ships with TypeScript types, so no need to install an additional types package.

```sh
npm install @virtuoso.dev/gurx
```

## Defining cells and signals

The first step in building your state management logic is to define the cells and signals that will flow and transform the values of your state. Unlike other state management libraries, Gurx doesn't have the concept of a store. Instead, the cells and signals definitions are declared on the module level. A cell is defined by calling the `Cell` function, which accepts an initial value, an initialization function that can be used to connect the cell to other nodes using the realm instance that starts it, and an optional distinct flag (`true` by default). The `Signal` function is the same but without the initial value argument.

Note: You can name the node references with a dollar sign suffix, to indicate that they are reactive. Most likely, you will reference their values in the body of the operators/React components without the dollar sign suffix.

```ts
const myCell$ = Cell(
  // initial value
  0,
  // the r is the realm instance that starts the cell
  (r) => {
    r.sub(myCell$, (value) => {
      console.log('myCell$ changed to', value)
    })
  }
  // distinct flag, true by default
  true
)

// Since signals have no initial value, you need to specify the type of data that will flow through them
const mySignal$ = Signal<number>(
  // the r is the realm instance that starts the cell
  (r) => {
    r.sub(mySignal$, (value) => {
      console.log('mySignal$ changed to', value)
    })
    // publishing a value through a signal will publish it into $myCell as well
    r.link(mySignal$, myCell$)
  },
  // distinct flag
  true
)
```

Note: if a node passes non-primitive values, but you want to optimize the computation, you can pass a custom comparator function as the `distinct` argument.

## Working with nodes

On their own, the cell/signal definitions won't do anything. The actual work happens when a realm instance is created and you start interacting with node refs returned from `Cell`/`Signal`. The next section shows some of the basic node interactions.

### Publishing and subscribing, and getting the current values

Following the example above, you can create a realm instance and publish a value through the declared signal using `pub` and `sub`:

```ts
const realm = new Realm()

realm.sub(myCell$, (value) => {
  console.log('a subscription from the outside', value)
})

realm.pub(mySignal$, 1)
```

Note: In addition to `pub`/`sub`, the realm supports both publishing and subscribing to multiple nodes at once with its `pubIn` and `subMultiple` methods. You can also use exclusive, "singleton" subscriptions through the `singletonSub` method - these are useful for event handling mechanisms.

```ts
// multiple publishing with a single recalculation
realm.pubIn({
  [foo$]: 'foo 1 value',
  [bar$]: 'bar 1 value',
})

// subscribe to the values of multiple nodes with a single subscription
r.subMultiple([foo$, bar$], ([foo, bar]) => console.log(foo, bar))
```

The cell nodes are stateful, you can also get their current value for a given realm instance using the `getValue`/`getValues` methods at any moment:

```ts
r.getValue(myCell$) // 1
r.getValues([myCell$ /* $myCell2, $myCell3, etc */])
```

While perfectly fine, and sometimes necessary, getting the values moves the data outside of the reactive realm paradigm. You should use those as the final endpoint of your state management.

## Linking, combining, and transforming nodes

The examples so far have referred to the most basic way of connecting nodes - the `link` method. It's a one-way connection that pushes the values from the source node to the target node. The bread and butter of Gurx are the operators that allow you to create more complex relationships between the nodes. The operators are used with the realm's `pipe` method. The below example will add `1` to the value that flows through `mySignal$` and publish it to `myCell$`:

```ts
// use this in the initialization function of mySignal$
r.link(
  r.pipe(
    mySignal$,
    map((x) => x + 1)
  ),
  myCell$
)
```

`map` and `filter` are the most basic operators. Gurx includes additional ones like `mapTo`, `throttleTime`, and `withLatestFrom`. An operator can be a conditional, like `filter`, or even asynchronous, like `throttleTime` or `handlePromise`. You can create custom operators by implementing the `Operator` interface.

## Using in React

Gurx includes a `RealmProvider` React component and a set of hooks that allow you to access the values and publish new values in the given nodes. Referring to a node in the hooks automatically initiates it in the nearest realm.

```tsx
const foo$ = Cell('foo', true)

function Foo() {
  const foo = useCellValue(foo$)
  return <div>{foo}</div>
}

export function App() {
  return (
    <RealmProvider>
      <Foo />
    </RealmProvider>
  )
}
```

Additional hooks include `usePublisher`, `useCellValues`, and the low-level `useRealm` that returns the realm instance from the provider.

## Next steps

The README is meant to give you a breath-first overview of the library. More details about the operators, hooks, and realm capabilities can be found in the API Reference.
