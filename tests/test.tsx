import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import {
  cleanup,
  fireEvent,
  render,
  waitForElement,
} from '@testing-library/react'
import create, {
  State,
  StateListener,
  StateSelector,
  PartialState,
  EqualityChecker,
  SubscribeOptions,
  StateCreator,
  SetState,
  GetState,
  Subscribe,
  Destroy,
  UseStore,
  StoreApi,
} from '../src/index'
import { devtools, redux } from '../src/middleware'

const consoleError = console.error
afterEach(() => {
  cleanup()
  console.error = consoleError
})

it('creates a store hook and api object', () => {
  let params
  const result = create((...args) => {
    params = args
    return { value: null }
  })
  expect({ params, result }).toMatchInlineSnapshot(`
    Object {
      "params": Array [
        [Function],
        [Function],
        Object {
          "destroy": [Function],
          "getState": [Function],
          "setState": [Function],
          "subscribe": [Function],
        },
      ],
      "result": Array [
        [Function],
        Object {
          "destroy": [Function],
          "getState": [Function],
          "setState": [Function],
          "subscribe": [Function],
        },
      ],
    }
  `)
})

it('uses the store with no args', async () => {
  const [useStore] = create(set => ({
    count: 0,
    inc: () => set(state => ({ count: state.count + 1 })),
  }))

  function Counter() {
    const { count, inc } = useStore()
    React.useEffect(inc, [])
    return <div>count: {count}</div>
  }

  const { getByText } = render(<Counter />)

  await waitForElement(() => getByText('count: 1'))
})

it('uses the store with selectors', async () => {
  const [useStore] = create(set => ({
    count: 0,
    inc: () => set(state => ({ count: state.count + 1 })),
  }))

  function Counter() {
    const count = useStore(s => s.count)
    const inc = useStore(s => s.inc)
    React.useEffect(inc, [])
    return <div>count: {count}</div>
  }

  const { getByText } = render(<Counter />)

  await waitForElement(() => getByText('count: 1'))
})

it('uses the store with a selector and equality checker', async () => {
  const [useStore, { setState }] = create(() => ({ value: 0 }))
  let renderCount = 0

  function Component() {
    // Prevent re-render if new value === 1.
    const value = useStore(s => s.value, (_, newValue) => newValue === 1)
    return (
      <div>
        renderCount: {++renderCount}, value: {value}
      </div>
    )
  }

  const { getByText } = render(<Component />)

  await waitForElement(() => getByText('renderCount: 1, value: 0'))

  // This will not cause a re-render.
  act(() => setState({ value: 1 }))
  await waitForElement(() => getByText('renderCount: 1, value: 0'))

  // This will cause a re-render.
  act(() => setState({ value: 2 }))
  await waitForElement(() => getByText('renderCount: 2, value: 2'))
})

it('only re-renders if selected state has changed', async () => {
  const [useStore] = create(set => ({
    count: 0,
    inc: () => set(state => ({ count: state.count + 1 })),
  }))
  let counterRenderCount = 0
  let controlRenderCount = 0

  function Counter() {
    const count = useStore(state => state.count)
    counterRenderCount++
    return <div>count: {count}</div>
  }

  function Control() {
    const inc = useStore(state => state.inc)
    controlRenderCount++
    return <button onClick={inc}>button</button>
  }

  const { getByText } = render(
    <>
      <Counter />
      <Control />
    </>
  )

  fireEvent.click(getByText('button'))

  await waitForElement(() => getByText('count: 1'))

  expect(counterRenderCount).toBe(2)
  expect(controlRenderCount).toBe(1)
})

it('can batch updates', async () => {
  const [useStore] = create(set => ({
    count: 0,
    inc: () => set(state => ({ count: state.count + 1 })),
  }))

  function Counter() {
    const { count, inc } = useStore()
    React.useEffect(() => {
      ReactDOM.unstable_batchedUpdates(() => {
        inc()
        inc()
      })
    }, [])
    return <div>count: {count}</div>
  }

  const { getByText } = render(<Counter />)

  await waitForElement(() => getByText('count: 2'))
})

it('can update the selector', async () => {
  const [useStore] = create(() => ({
    one: 'one',
    two: 'two',
  }))

  function Component({ selector }) {
    return <div>{useStore(selector)}</div>
  }

  const { getByText, rerender } = render(<Component selector={s => s.one} />)
  await waitForElement(() => getByText('one'))

  rerender(<Component selector={s => s.two} />)
  await waitForElement(() => getByText('two'))
})

it('can update the equality checker', async () => {
  const [useStore, { setState }] = create(() => ({ value: 0 }))
  const selector = s => s.value

  let renderCount = 0
  function Component({ equalityFn }) {
    const value = useStore(selector, equalityFn)
    return (
      <div>
        renderCount: {++renderCount}, value: {value}
      </div>
    )
  }

  // Set an equality checker that always returns false to always re-render.
  const { getByText, rerender } = render(<Component equalityFn={() => false} />)

  // This will cause a re-render due to the equality checker.
  act(() => setState({ value: 0 }))
  await waitForElement(() => getByText('renderCount: 2, value: 0'))

  // Set an equality checker that always returns true to never re-render.
  rerender(<Component equalityFn={() => true} />)

  // This will NOT cause a re-render due to the equality checker.
  act(() => setState({ value: 1 }))
  await waitForElement(() => getByText('renderCount: 3, value: 0'))
})

it('can call useStore with progressively more arguments', async () => {
  const [useStore, { setState }] = create(() => ({ value: 0 }))

  let renderCount = 0
  function Component({ selector, equalityFn }: any) {
    const value = useStore(selector, equalityFn)
    return (
      <div>
        renderCount: {++renderCount}, value: {JSON.stringify(value)}
      </div>
    )
  }

  // Render with no args.
  const { getByText, rerender } = render(<Component />)
  await waitForElement(() => getByText('renderCount: 1, value: {"value":0}'))

  // Render with selector.
  rerender(<Component selector={s => s.value} />)
  await waitForElement(() => getByText('renderCount: 2, value: 0'))

  // Render with selector and equality checker.
  rerender(
    <Component
      selector={s => s.value}
      equalityFn={(oldV, newV) => oldV > newV}
    />
  )

  // Should not cause a re-render because new value is less than previous.
  act(() => setState({ value: -1 }))
  await waitForElement(() => getByText('renderCount: 3, value: 0'))

  act(() => setState({ value: 1 }))
  await waitForElement(() => getByText('renderCount: 4, value: 1'))
})

it('can throw an error in selector', async () => {
  console.error = jest.fn()

  const initialState = { value: 'foo' }
  const [useStore, { setState }] = create(() => initialState)
  const selector = s => s.value.toUpperCase()

  class ErrorBoundary extends React.Component {
    state = { hasError: false }
    static getDerivedStateFromError() {
      return { hasError: true }
    }
    render() {
      return this.state.hasError ? <div>errored</div> : this.props.children
    }
  }

  function Component() {
    useStore(selector)
    return <div>no error</div>
  }

  const { getByText } = render(
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  )
  await waitForElement(() => getByText('no error'))

  delete initialState.value
  act(() => {
    setState({})
  })
  await waitForElement(() => getByText('errored'))
})

it('can throw an error in equality checker', async () => {
  console.error = jest.fn()

  const initialState = { value: 'foo' }
  const [useStore, { setState }] = create(() => initialState)
  const selector = s => s
  const equalityFn = (a, b) => a.value.trim() === b.value.trim()

  class ErrorBoundary extends React.Component {
    state = { hasError: false }
    static getDerivedStateFromError() {
      return { hasError: true }
    }
    render() {
      return this.state.hasError ? <div>errored</div> : this.props.children
    }
  }

  function Component() {
    useStore(selector, equalityFn)
    return <div>no error</div>
  }

  const { getByText } = render(
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  )
  await waitForElement(() => getByText('no error'))

  delete initialState.value
  act(() => {
    setState({})
  })
  await waitForElement(() => getByText('errored'))
})

it('can get the store', () => {
  const [, { getState }] = create((_, get) => ({
    value: 1,
    getState1: () => get(),
    getState2: () => getState(),
  }))

  expect(getState().getState1().value).toBe(1)
  expect(getState().getState2().value).toBe(1)
})

it('can set the store', () => {
  const [, { setState, getState }] = create(set => ({
    value: 1,
    setState1: v => set(v),
    setState2: v => setState(v),
  }))

  getState().setState1({ value: 2 })
  expect(getState().value).toBe(2)
  getState().setState2({ value: 3 })
  expect(getState().value).toBe(3)
  getState().setState1(s => ({ value: ++s.value }))
  expect(getState().value).toBe(4)
  getState().setState2(s => ({ value: ++s.value }))
  expect(getState().value).toBe(5)
})

it('can subscribe to the store', () => {
  const initialState = { value: 1, other: 'a' }
  const [, { setState, getState, subscribe }] = create(() => initialState)

  // Should not be called if new state identity is the same
  let unsub = subscribe(() => {
    throw new Error('subscriber called when new state identity is the same')
  })
  setState(initialState)
  unsub()

  // Should be called if new state identity is different
  unsub = subscribe((newState: { value: number; other: string }) => {
    expect(newState.value).toBe(1)
  })
  setState({ ...getState() })
  unsub()

  // Should not be called when state slice is the same
  unsub = subscribe(
    () => {
      throw new Error('subscriber called when new state is the same')
    },
    { selector: s => s.value }
  )
  setState({ other: 'b' })
  unsub()

  // Should be called when state slice changes
  unsub = subscribe(
    (value: number) => {
      expect(value).toBe(initialState.value + 1)
    },
    { selector: s => s.value }
  )
  setState({ value: initialState.value + 1 })
  unsub()

  // Should not be called when equality checker returns true
  unsub = subscribe(
    () => {
      throw new Error('subscriber called when equality checker returned true')
    },
    { equalityFn: () => true }
  )
  setState({ value: initialState.value + 2 })
  unsub()

  // Should be called when equality checker returns false
  unsub = subscribe(
    (value: number) => {
      expect(value).toBe(initialState.value + 2)
    },
    { selector: s => s.value, equalityFn: () => false }
  )
  setState(getState())
  unsub()

  // Can pass in initial state when subscribing
  unsub = subscribe(
    () => {
      throw new Error(
        'subscriber called when initial state is the same as new state'
      )
    },
    { selector: s => s.value, currentSlice: initialState.value + 3 }
  )
  setState({ value: initialState.value + 3 })
  unsub()
})

it('can destroy the store', () => {
  const [, { destroy, getState, setState, subscribe }] = create(() => ({
    value: 1,
  }))

  subscribe(() => {
    throw new Error('did not clear listener on destroy')
  })
  destroy()

  setState({ value: 2 })
  expect(getState().value).toEqual(2)
})

it('only calls selectors when necessary', async () => {
  const [useStore, { setState }] = create(() => ({ a: 0, b: 0 }))
  let inlineSelectorCallCount = 0
  let staticSelectorCallCount = 0

  function staticSelector(s) {
    staticSelectorCallCount++
    return s.a
  }

  function Component() {
    useStore(s => (inlineSelectorCallCount++, s.b))
    useStore(staticSelector)
    return (
      <>
        <div>inline: {inlineSelectorCallCount}</div>
        <div>static: {staticSelectorCallCount}</div>
      </>
    )
  }

  const { rerender, getByText } = render(<Component />)
  await waitForElement(() => getByText('inline: 1'))
  await waitForElement(() => getByText('static: 1'))

  rerender(<Component />)
  await waitForElement(() => getByText('inline: 2'))
  await waitForElement(() => getByText('static: 1'))

  act(() => setState({ a: 1, b: 1 }))
  await waitForElement(() => getByText('inline: 4'))
  await waitForElement(() => getByText('static: 2'))
})

it('can use exposed types', () => {
  interface ExampleState extends State {
    num: number
    numGet: () => number
    numGetState: () => number
    numSet: (v: number) => void
    numSetState: (v: number) => void
  }

  const listener: StateListener<ExampleState> = state => {
    const value = state.num * state.numGet() * state.numGetState()
    state.numSet(value)
    state.numSetState(value)
  }
  const selector: StateSelector<ExampleState, number> = state => state.num
  const partial: PartialState<ExampleState> = { num: 2, numGet: () => 2 }
  const partialFn: PartialState<ExampleState> = state => ({ num: 2, ...state })
  const equlaityFn: EqualityChecker<ExampleState> = (state, newState) =>
    state !== newState

  const [useStore, storeApi] = create<ExampleState>((set, get) => ({
    num: 1,
    numGet: () => get().num,
    numGetState: () => {
      // TypeScript can't get the type of storeApi when it trys to enforce the signature of numGetState.
      // Need to explicitly state the type of storeApi.getState().num or storeApi type will be type 'any'.
      const result: number = storeApi.getState().num
      return result
    },
    numSet: v => {
      set({ num: v })
    },
    numSetState: v => {
      storeApi.setState({ num: v })
    },
  }))

  const stateCreator: StateCreator<ExampleState> = (set, get) => ({
    num: 1,
    numGet: () => get().num,
    numGetState: () => get().num,
    numSet: v => {
      set({ num: v })
    },
    numSetState: v => {
      set({ num: v })
    },
  })

  const subscribeOptions: SubscribeOptions<ExampleState, number> = {
    selector: s => s.num,
    equalityFn: (a, b) => a < b,
    currentSlice: 1,
    subscribeError: new Error(),
  }

  function checkAllTypes(
    getState: GetState<ExampleState>,
    partialState: PartialState<ExampleState>,
    setState: SetState<ExampleState>,
    state: State,
    stateListener: StateListener<ExampleState>,
    stateSelector: StateSelector<ExampleState, number>,
    storeApi: StoreApi<ExampleState>,
    subscribe: Subscribe<ExampleState>,
    destroy: Destroy,
    equalityFn: EqualityChecker<ExampleState>,
    stateCreator: StateCreator<ExampleState>,
    useStore: UseStore<ExampleState>,
    subscribeOptions: SubscribeOptions<ExampleState, number>
  ) {
    expect(true).toBeTruthy()
  }

  checkAllTypes(
    storeApi.getState,
    Math.random() > 0.5 ? partial : partialFn,
    storeApi.setState,
    storeApi.getState(),
    listener,
    selector,
    storeApi,
    storeApi.subscribe,
    storeApi.destroy,
    equlaityFn,
    stateCreator,
    useStore,
    subscribeOptions
  )
})

describe('redux dev tools middleware', () => {
  const consoleWarn = console.warn

  afterEach(() => {
    cleanup()
    console.warn = consoleWarn
  })

  it('can warn when trying to use redux devtools without extension', () => {
    console.warn = jest.fn()

    const initialState = { count: 0 }
    const types = { increase: 'INCREASE', decrease: 'DECREASE' }
    const reducer = (state, { type, by }) => {
      switch (type) {
        case types.increase:
          return { count: state.count + by }
        case types.decrease:
          return { count: state.count - by }
      }
    }

    create(devtools(redux(reducer, initialState)))

    expect(console.warn).toBeCalled()
  })
})
