<p align="center">
  <img width="700" src="bear.png" />
</p>

[![Build Status](https://travis-ci.org/react-spring/zustand.svg?branch=master)](https://travis-ci.org/react-spring/zustand) [![npm version](https://badge.fury.io/js/zustand.svg)](https://badge.fury.io/js/zustand)

    npm install zustand

Small, fast and scaleable bearbones state-management solution. Has a comfy api based on hooks, isn't that boilerplatey or opinionated, but still just enough to be explicit and flux-like, it's cross-platform to boot. Make your paws dirty with a small live demo [here](https://codesandbox.io/s/v8pjv251w7).

#### Why zustand over redux? This lib ...

1. is simpler and un-opinionated
2. makes hooks the primary means of consuming state
3. isn't dependent on actions, types & dispatch
4. supports [mixed reconcilers](https://github.com/konvajs/react-konva/issues/188)
5. has a solution for rapidpy changing state (look for transient updates)

### How to use it

#### First create a store (or multiple, up to you...)

You could be in global or component scope, manage your store anywhere you want!

```jsx
import create from 'zustand'

// You store is a hook! Name it anything you like
const [useStore] = create(set => ({
  // Everything in here is your state, actions are not special, you don't need to nest them
  count: 1,
  actions: {
    inc: () => set(state => ({ count: state.count + 1 })), // same semantics as setState
    dec: () => set(state => ({ count: state.count - 1 })), // ... it *merges* state
  },
}))
```

#### Bind components, done ...

Look Ma, no providers!

```jsx
function Counter() {
  // Will only re-render the component when "count" changes
  const count = useStore(state => state.count)
  return <h1>{count}</h1>
}

function Controls() {
  // We've put our actions under "state.actions", makes fetching them easier
  const actions = useStore(state => state.actions)
  return (
    <>
      <button onClick={actions.inc}>up</button>
      <button onClick={actions.dec}>down</button>
    </>
  )
}
```

# Recipes

## Fetching everything

You can, but remember that it will cause the component to update on every state change!

```jsx
const state = useStore()
```

## Selecting multiple state slices

Just like with Reduxes mapStateToProps, useStore can select state, either atomically or by returning an object. It will run a small shallow-equal test over the results you return and update the component on changes only.

```jsx
const { foo, bar } = useStore(state => ({ foo: state.foo, bar: state.bar }))
```

Atomic selects do the same ...

```jsx
const foo = useStore(state => state.foo)
const bar = useStore(state => state.bar)
```

## Fetching from multiple stores

Since you can create as many stores as you like, forwarding results to succeeding selectors is as natural as it gets.

```jsx
const currentUser = useCredentialsStore(state => state.currentUser)
const person = usePersonStore(state => state.persons[currentUser])
```

## Memoizing selectors, optimizing performance

Say you select a piece of state ...

```js
const foo = useStore(state => state.foo[props.id])
```

Your selector (`state => state.foo[props.id]`) will run on every state change, as well as every time the component renders. It isn't that expensive in this case, but let's optimize it for arguments sake.

You can either pass a static reference:

```js
const fooSelector = useCallback(state => state.foo[props.id], [props.id])
const foo = useStore(fooSelector)
```

Or an optional dependencies array to let zustand know when the selector needs to update:

```js
const foo = useStore(state => state.foo[props.id], [props.id])
```

From now on your selector is memoized and will only run when either the state changes, or the selector itself.

## Async actions

Just call `set` when you're ready, it doesn't care if your actions are async or not.

```jsx
const [useStore] = create(set => ({
  json: {},
  fetch: async url => {
    const response = await fetch(url)
    set({ json: await response.json() })
```

## Read from state in actions

`set` allows fn-updates `set(state => result)`, but you still have access to state outside of it through `get`.

```jsx
const [useStore] = create((set, get) => ({
  text: "hello",
  action: () => {
    const text = get().text
```

## Sick of reducers and changing nested state? Use Immer!

Reducing nested structures is tiresome. Have you tried [immer](https://github.com/mweststrate/immer)?

```jsx
import produce from "immer"

const [useStore] = create(set => ({
  set: fn => set(produce(fn)),
  nested: { structure: { constains: { a: "value" } } },
}))

const set = useStore(state => state.set)
set(state => void state.nested.structure.contains = null)
```

## Can't live without redux-like reducers and action types?

```jsx
const types = { increase: "INCREASE", decrease: "DECREASE" }

const reducer = (state, { type, by = 1 }) => {
  switch (type) {
    case types.increase: return { count: state.count + by }
    case types.decrease: return { count: state.count - by }
  }
}

const [useStore] = create(set => ({
  count: 0,
  dispatch: args => set(state => reducer(state, args)),
}))

const dispatch = useStore(state => state.dispatch)
dispatch({ type: types.increase, by: 2 })
```

## Reading/writing state and reacting to changes outside of components

You can use it with or without React out of the box.

```jsx
const [, api] = create({ a: 1, b: 2, c: 3 })

// Getting fresh state
const num = api.getState().n
// Listening to all changes, fires on every dispatch
const unsub1 = api.subscribe(state => console.log("state changed", state))
// Listening to selected changes
const unsub2 = api.subscribe(state => state.a, a => console.log("a changed", a))
// Updating state, will trigger listeners
api.setState({ a: 1 })
// Unsubscribe listeners
unsub1()
unsub2()
// Destroying the store (removing all listeners)
api.destroy()
```

## Transient updates (for often occuring state-changes)

The api signature of subscribe([selector,] callback):unsub allows you to easily bind a component to a store without forcing it to re-render on state changes, you will be notified in a callback instead. Best combine it with useEffect. This can make a [drastic](https://codesandbox.io/s/peaceful-johnson-txtws) performance difference when you are allowed to mutate the view directly.

```jsx
const [useStore, api] = create(set => ({ [0]: [-10, 0], [1]: [10, 5], ... }))

function Component({ id }) {
  // Fetch initial state
  const xy = useRef(api.getState()[id])
  // Connect to the store on mount, disconnect on unmount, catch state-changes in a callback
  useEffect(() => api.subscribe(state => state[id], coords => (xy.current = coords)), [id])
```

## Middleware

You can functionally compose your store any way you like.

```jsx
const logger = fn => (set, get) => fn(args => {
  console.log("  applying", args)
  set(args)
  console.log("  new state", get())
}, get)

const [useStore] = create(logger(set => ({
  text: "hello",
  setText: text => set({ text })
})))
```
