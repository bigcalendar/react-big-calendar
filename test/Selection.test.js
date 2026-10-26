import Selection, {
  getEventNodeFromPoint,
  getShowMoreNodeFromPoint,
  isEvent,
  isShowMore,
  objectsCollide,
  getBoundsForNode,
} from '../src/Selection'

// Helpers shared across suites
let container
let selection

function makeSelection(opts = {}) {
  return new Selection(container, opts)
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  if (selection && !selection.isDetached) {
    selection.teardown()
    selection = null
  }
  if (container && document.body.contains(container)) {
    document.body.removeChild(container)
  }
})

// ── Constructor ───────────────────────────────────────────────────────────────
describe('Selection — constructor', () => {
  test('initializes with default options', () => {
    selection = makeSelection()
    expect(selection.selecting).toBe(false)
    expect(selection.isDetached).toBe(false)
    expect(selection.globalMouse).toBe(false)
    expect(selection.longPressThreshold).toBe(250)
    expect(selection.validContainers).toEqual([])
  })

  test('accepts custom longPressThreshold', () => {
    selection = makeSelection({ longPressThreshold: 500 })
    expect(selection.longPressThreshold).toBe(500)
  })

  test('sets globalMouse=true when global=true', () => {
    selection = makeSelection({ global: true })
    expect(selection.globalMouse).toBe(true)
  })

  test('sets globalMouse=true when container is null', () => {
    selection = new Selection(null, {})
    expect(selection.globalMouse).toBe(true)
    selection.teardown()
    selection = null
  })

  test('accepts validContainers', () => {
    selection = makeSelection({ validContainers: ['.rbc-calendar'] })
    expect(selection.validContainers).toEqual(['.rbc-calendar'])
  })

  test('binds all handler methods', () => {
    selection = makeSelection()
    expect(typeof selection._handleInitialEvent).toBe('function')
    expect(typeof selection._handleMoveEvent).toBe('function')
    expect(typeof selection._handleTerminatingEvent).toBe('function')
    expect(typeof selection._keyListener).toBe('function')
  })
})

// ── Mouse/touch input switching (#2817) ──────────────────────────────────────
describe('Selection — mouse and touch input', () => {
  let originalElementFromPoint

  beforeEach(() => {
    jest.useFakeTimers()
    originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = jest.fn(() => container)
    selection = makeSelection({ longPressThreshold: 20 })
    selection.container = () => container
  })

  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint
    jest.useRealTimers()
  })

  function mouse(type, x = 40, y = 40) {
    container.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    }))
  }

  function touch(type, x = 40, y = 40) {
    const point = { clientX: x, clientY: y, pageX: x, pageY: y }
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'touches', {
      value: type === 'touchstart' || type === 'touchmove' ? [point] : [],
    })
    Object.defineProperty(event, 'changedTouches', { value: [point] })
    container.dispatchEvent(event)
  }

  test('accepts touch after mouse selection', () => {
    const beforeSelect = jest.fn()
    selection.on('beforeSelect', beforeSelect)

    mouse('mousedown')
    mouse('mouseup')
    touch('touchstart')
    jest.advanceTimersByTime(20)
    touch('touchend')

    expect(beforeSelect).toHaveBeenCalledTimes(2)
    expect(beforeSelect.mock.calls[0][0].isTouch).toBe(false)
    expect(beforeSelect.mock.calls[1][0].isTouch).toBe(true)
  })

  test('accepts mouse after touch selection', () => {
    const beforeSelect = jest.fn()
    selection.on('beforeSelect', beforeSelect)

    touch('touchstart')
    jest.advanceTimersByTime(20)
    touch('touchend')
    jest.advanceTimersByTime(501)
    mouse('mousedown')
    mouse('mouseup')

    expect(beforeSelect).toHaveBeenCalledTimes(2)
    expect(beforeSelect.mock.calls[0][0].isTouch).toBe(true)
    expect(beforeSelect.mock.calls[1][0].isTouch).toBe(false)
  })

  test('ignores compatibility mouse events following a touch', () => {
    const beforeSelect = jest.fn()
    selection.on('beforeSelect', beforeSelect)

    touch('touchstart')
    jest.advanceTimersByTime(20)
    touch('touchend')
    mouse('mousedown')
    mouse('mouseup')

    expect(beforeSelect).toHaveBeenCalledTimes(1)
  })

  test('allows immediate real mouse input away from the touch position', () => {
    const beforeSelect = jest.fn()
    selection.on('beforeSelect', beforeSelect)

    touch('touchstart')
    jest.advanceTimersByTime(20)
    touch('touchend')
    mouse('mousedown', 100, 100)
    mouse('mouseup', 100, 100)

    expect(beforeSelect).toHaveBeenCalledTimes(2)
  })

  test('allows real mouse input at the same spot when identified as non-touch', () => {
    const beforeSelect = jest.fn()
    selection.on('beforeSelect', beforeSelect)

    touch('touchstart')
    jest.advanceTimersByTime(20)
    touch('touchend')
    const event = new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, clientX: 40, clientY: 40,
    })
    Object.defineProperty(event, 'sourceCapabilities', {
      value: { firesTouchEvents: false },
    })
    container.dispatchEvent(event)
    mouse('mouseup')

    expect(beforeSelect).toHaveBeenCalledTimes(2)
  })

  test('ignores touch-generated mouse events identified by the browser', () => {
    const beforeSelect = jest.fn()
    selection.on('beforeSelect', beforeSelect)

    const event = new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, clientX: 40, clientY: 40,
    })
    Object.defineProperty(event, 'sourceCapabilities', {
      value: { firesTouchEvents: true },
    })
    container.dispatchEvent(event)
    mouse('mouseup')

    expect(beforeSelect).not.toHaveBeenCalled()
  })

  test('cancels a pending long press on touchcancel', () => {
    const beforeSelect = jest.fn()
    selection.on('beforeSelect', beforeSelect)

    touch('touchstart')
    touch('touchcancel')
    jest.advanceTimersByTime(30)

    expect(beforeSelect).not.toHaveBeenCalled()
  })

  test('teardown removes the long-press listener and its pending timer', () => {
    touch('touchstart')
    selection.teardown()
    expect(jest.getTimerCount()).toBe(0)

    touch('touchstart')
    expect(jest.getTimerCount()).toBe(0)
  })
})

// ── on / emit ─────────────────────────────────────────────────────────────────
describe('Selection — on / emit', () => {
  beforeEach(() => { selection = makeSelection() })

  test('on registers handler; emit calls it', () => {
    const fn = jest.fn()
    selection.on('click', fn)
    selection.emit('click', { x: 1 })
    expect(fn).toHaveBeenCalledWith({ x: 1 })
  })

  test('on().remove() stops handler from firing', () => {
    const fn = jest.fn()
    const sub = selection.on('click', fn)
    sub.remove()
    selection.emit('click', {})
    expect(fn).not.toHaveBeenCalled()
  })

  test('multiple handlers for same event all fire', () => {
    const a = jest.fn()
    const b = jest.fn()
    selection.on('select', a)
    selection.on('select', b)
    selection.emit('select', {})
    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
  })

  test('emit returns first handler result', () => {
    selection.on('test', () => 'first')
    selection.on('test', () => 'second')
    expect(selection.emit('test')).toBe('first')
  })

  test('emit returns undefined when no handlers', () => {
    expect(selection.emit('nothing')).toBeUndefined()
  })
})

// ── isClick ───────────────────────────────────────────────────────────────────
describe('Selection — isClick', () => {
  beforeEach(() => {
    selection = makeSelection()
    selection._initialEventData = { x: 100, y: 100, isTouch: false }
  })

  test('returns true when within clickTolerance (5px)', () => {
    expect(selection.isClick(104, 104)).toBe(true)
  })

  test('returns false when x exceeds tolerance', () => {
    expect(selection.isClick(106, 100)).toBe(false)
  })

  test('returns false when y exceeds tolerance', () => {
    expect(selection.isClick(100, 106)).toBe(false)
  })

  test('returns false for touch events regardless of position', () => {
    selection._initialEventData.isTouch = true
    expect(selection.isClick(100, 100)).toBe(false)
  })

  test('returns true at exact tolerance boundary', () => {
    expect(selection.isClick(105, 105)).toBe(true)
  })
})

// ── _handleClickEvent ─────────────────────────────────────────────────────────
describe('Selection — _handleClickEvent', () => {
  beforeEach(() => { selection = makeSelection() })

  test('emits click on first click', () => {
    const fn = jest.fn()
    selection.on('click', fn)
    selection._handleClickEvent({ type: 'mouseup', pageX: 10, pageY: 10, clientX: 10, clientY: 10 })
    expect(fn).toHaveBeenCalled()
  })

  test('emits doubleClick on second click within 250ms', () => {
    const dblFn = jest.fn()
    selection.on('doubleClick', dblFn)
    selection._lastClickData = { timestamp: Date.now() - 100 }
    selection._handleClickEvent({ type: 'mouseup', pageX: 10, pageY: 10, clientX: 10, clientY: 10 })
    expect(dblFn).toHaveBeenCalled()
  })

  test('emits click (not doubleClick) when last click was > 250ms ago', () => {
    const clickFn = jest.fn()
    const dblFn = jest.fn()
    selection.on('click', clickFn)
    selection.on('doubleClick', dblFn)
    selection._lastClickData = { timestamp: Date.now() - 300 }
    selection._handleClickEvent({ type: 'mouseup', pageX: 10, pageY: 10, clientX: 10, clientY: 10 })
    expect(clickFn).toHaveBeenCalled()
    expect(dblFn).not.toHaveBeenCalled()
  })
})

// ── _handleMoveEvent ──────────────────────────────────────────────────────────
describe('Selection — _handleMoveEvent', () => {
  beforeEach(() => { selection = makeSelection() })

  test('returns early when _initialEventData is null', () => {
    selection._initialEventData = null
    const fn = jest.fn()
    selection.on('selectStart', fn)
    selection._handleMoveEvent({ pageX: 100, pageY: 100, preventDefault: jest.fn() })
    expect(fn).not.toHaveBeenCalled()
  })

  test('returns early when isDetached', () => {
    selection._initialEventData = { x: 0, y: 0, isTouch: false }
    selection.isDetached = true
    const fn = jest.fn()
    selection.on('selectStart', fn)
    selection._handleMoveEvent({ pageX: 100, pageY: 100, preventDefault: jest.fn() })
    expect(fn).not.toHaveBeenCalled()
  })

  test('emits selectStart on first move beyond tolerance', () => {
    selection._initialEventData = { x: 10, y: 10, isTouch: false }
    const fn = jest.fn()
    selection.on('selectStart', fn)
    selection._handleMoveEvent({ pageX: 100, pageY: 100, preventDefault: jest.fn() })
    expect(fn).toHaveBeenCalled()
  })

  test('emits selecting and updates _selectRect after selectStart', () => {
    selection._initialEventData = { x: 10, y: 10, isTouch: false }
    const fn = jest.fn()
    selection.on('selecting', fn)
    selection._handleMoveEvent({ pageX: 100, pageY: 100, preventDefault: jest.fn() })
    expect(fn).toHaveBeenCalled()
    expect(selection._selectRect).toBeTruthy()
    expect(selection.selecting).toBe(true)
  })

  test('does not emit selectStart on tiny move (click territory)', () => {
    selection._initialEventData = { x: 10, y: 10, isTouch: false }
    const fn = jest.fn()
    selection.on('selectStart', fn)
    // Move only 2px — within clickTolerance of 5
    selection._handleMoveEvent({ pageX: 12, pageY: 12, preventDefault: jest.fn() })
    // tiny move with w=2, h=2 — click=true, old=false, !(w || h) is false so it returns early
    expect(fn).not.toHaveBeenCalled()
  })
})

// ── _handleTerminatingEvent ───────────────────────────────────────────────────
describe('Selection — _handleTerminatingEvent', () => {
  beforeEach(() => {
    selection = makeSelection()
    selection._initialEventData = { x: 10, y: 10, isTouch: false }
  })

  test('emits select when selecting=true', () => {
    selection.selecting = true
    selection._selectRect = { top: 0, left: 0, right: 100, bottom: 100 }
    const fn = jest.fn()
    selection.on('select', fn)
    // container() is called internally — make it a callable function
    selection.container = () => container
    selection._handleTerminatingEvent({
      type: 'mouseup',
      target: container,
      key: undefined,
    })
    expect(fn).toHaveBeenCalled()
    expect(selection.selecting).toBe(false)
  })

  test('emits reset on Escape key', () => {
    // When not selecting and key event: e is replaced by _initialEvent
    // Then key='Escape' → emit reset
    selection.selecting = false
    const escapeEvent = { type: 'mouseup', key: 'Escape', target: container }
    selection._initialEvent = escapeEvent
    selection.container = () => container
    const fn = jest.fn()
    selection.on('reset', fn)
    selection._handleTerminatingEvent({ type: 'keydown', key: undefined, target: container })
    expect(fn).toHaveBeenCalled()
  })

  test('emits reset when not in valid container', () => {
    selection.validContainers = ['.rbc-does-not-exist']
    selection.selecting = false
    const fn = jest.fn()
    selection.on('reset', fn)
    selection._initialEvent = { type: 'mouseup', target: container }
    selection.container = () => container
    selection._handleTerminatingEvent({ type: 'mouseup', key: undefined, target: container })
    expect(fn).toHaveBeenCalled()
  })

  test('does nothing when e is null after key event with no initialEvent', () => {
    selection._initialEvent = null
    const fn = jest.fn()
    selection.on('reset', fn)
    selection.on('click', fn)
    selection.on('select', fn)
    // keydown with no _initialEvent means e becomes null inside handler
    selection._handleTerminatingEvent({ type: 'keydown', key: undefined })
    expect(fn).not.toHaveBeenCalled()
  })
})

// ── _dropFromOutsideListener ──────────────────────────────────────────────────
describe('Selection — _dropFromOutsideListener', () => {
  beforeEach(() => { selection = makeSelection() })

  test('emits dropFromOutside with coordinates', () => {
    const fn = jest.fn()
    selection.on('dropFromOutside', fn)
    const e = {
      pageX: 50, pageY: 60, clientX: 50, clientY: 60,
      preventDefault: jest.fn(),
    }
    selection._dropFromOutsideListener(e)
    expect(fn).toHaveBeenCalledWith({ x: 50, y: 60, clientX: 50, clientY: 60 })
    expect(e.preventDefault).toHaveBeenCalled()
  })

  test('extracts coords from touches when present', () => {
    const fn = jest.fn()
    selection.on('dropFromOutside', fn)
    const e = {
      touches: [{ pageX: 70, pageY: 80, clientX: 70, clientY: 80 }],
      preventDefault: jest.fn(),
    }
    selection._dropFromOutsideListener(e)
    expect(fn).toHaveBeenCalledWith({ x: 70, y: 80, clientX: 70, clientY: 80 })
  })
})

// ── _dragOverFromOutsideListener ──────────────────────────────────────────────
describe('Selection — _dragOverFromOutsideListener', () => {
  beforeEach(() => { selection = makeSelection() })

  test('emits dragOverFromOutside with coordinates', () => {
    const fn = jest.fn()
    selection.on('dragOverFromOutside', fn)
    const e = {
      pageX: 10, pageY: 20, clientX: 10, clientY: 20,
      preventDefault: jest.fn(),
    }
    selection._dragOverFromOutsideListener(e)
    expect(fn).toHaveBeenCalledWith({ x: 10, y: 20, clientX: 10, clientY: 20 })
    expect(e.preventDefault).toHaveBeenCalled()
  })
})

// ── _keyListener ──────────────────────────────────────────────────────────────
describe('Selection — _keyListener', () => {
  beforeEach(() => { selection = makeSelection() })

  test('sets ctrl=true when metaKey pressed', () => {
    selection._keyListener({ metaKey: true, ctrlKey: false })
    expect(selection.ctrl).toBe(true)
  })

  test('sets ctrl=true when ctrlKey pressed', () => {
    selection._keyListener({ metaKey: false, ctrlKey: true })
    expect(selection.ctrl).toBe(true)
  })

  test('sets ctrl=false when neither key pressed', () => {
    selection._keyListener({ metaKey: false, ctrlKey: false })
    expect(selection.ctrl).toBe(false)
  })
})

// ── _isWithinValidContainer ───────────────────────────────────────────────────
describe('Selection — _isWithinValidContainer', () => {
  test('returns true when validContainers is empty', () => {
    selection = makeSelection()
    expect(selection._isWithinValidContainer({ target: container })).toBe(true)
  })

  test('returns true when target matches a valid container selector', () => {
    const div = document.createElement('div')
    div.className = 'rbc-calendar'
    selection = makeSelection({ validContainers: ['.rbc-calendar'] })
    expect(selection._isWithinValidContainer({ target: div })).toBe(true)
  })

  test('returns false when target does not match any valid container', () => {
    const div = document.createElement('div')
    selection = makeSelection({ validContainers: ['.rbc-calendar'] })
    expect(selection._isWithinValidContainer({ target: div })).toBe(false)
  })

  test('returns true when target is null/undefined', () => {
    selection = makeSelection({ validContainers: ['.rbc-calendar'] })
    expect(selection._isWithinValidContainer({ target: null })).toBe(true)
  })
})

// ── teardown ──────────────────────────────────────────────────────────────────
describe('Selection — teardown', () => {
  test('sets isDetached=true and clears state', () => {
    selection = makeSelection()
    selection._initialEvent = {}
    selection.selecting = true
    selection._selectRect = {}
    selection.teardown()
    expect(selection.isDetached).toBe(true)
    expect(selection.selecting).toBe(false)
    expect(selection._initialEvent).toBeNull()
    expect(selection._selectRect).toBeNull()
  })

  test('clears all listener handlers', () => {
    selection = makeSelection()
    const fn = jest.fn()
    selection.on('click', fn)
    selection.teardown()
    selection.emit('click')
    expect(fn).not.toHaveBeenCalled()
  })

  test('is safe to call when optional remove fns are absent', () => {
    selection = makeSelection()
    // Remove some cleanup functions to test guard clauses
    selection._removeEndListener = null
    selection._removeMoveListener = null
    selection._onEscListener = null
    expect(() => selection.teardown()).not.toThrow()
  })
})

// ── isSelected / filter ───────────────────────────────────────────────────────
describe('Selection — isSelected / filter', () => {
  beforeEach(() => { selection = makeSelection() })

  test('isSelected returns false when not selecting', () => {
    expect(selection.isSelected(document.createElement('div'))).toBe(false)
  })

  test('isSelected returns false when _selectRect is null', () => {
    selection.selecting = true
    selection._selectRect = null
    expect(selection.isSelected(document.createElement('div'))).toBe(false)
  })

  test('filter returns empty array when not selecting', () => {
    expect(selection.filter([{ id: 1 }, { id: 2 }])).toEqual([])
  })

  test('filter returns empty array when _selectRect is null', () => {
    selection.selecting = true
    selection._selectRect = null
    expect(selection.filter([{ id: 1 }])).toEqual([])
  })
})

// ── objectsCollide ────────────────────────────────────────────────────────────
describe('Selection — objectsCollide', () => {
  test('returns true for overlapping boxes', () => {
    const a = { top: 0, left: 0, bottom: 100, right: 100 }
    const b = { top: 50, left: 50, bottom: 150, right: 150 }
    expect(objectsCollide(a, b)).toBe(true)
  })

  test('returns false for completely separate boxes', () => {
    const a = { top: 0, left: 0, bottom: 50, right: 50 }
    const b = { top: 100, left: 100, bottom: 200, right: 200 }
    expect(objectsCollide(a, b)).toBe(false)
  })

  test('returns true at exact boundary (touching)', () => {
    const a = { top: 0, left: 0, bottom: 100, right: 100 }
    const b = { top: 100, left: 100, bottom: 200, right: 200 }
    expect(objectsCollide(a, b)).toBe(true)
  })

  test('handles plain point (no right/bottom): point-vs-box', () => {
    const box = { top: 0, left: 0, bottom: 100, right: 100 }
    const point = { top: 50, left: 50 }
    // right defaults to left, bottom defaults to top → treated as a point
    expect(objectsCollide(box, point)).toBe(true)
  })

  test('returns false when a is above b with gap', () => {
    const a = { top: 0, left: 0, bottom: 40, right: 100 }
    const b = { top: 60, left: 0, bottom: 100, right: 100 }
    expect(objectsCollide(a, b)).toBe(false)
  })

  test('returns false when a is left of b with gap', () => {
    const a = { top: 0, left: 0, bottom: 100, right: 40 }
    const b = { top: 0, left: 60, bottom: 100, right: 100 }
    expect(objectsCollide(a, b)).toBe(false)
  })

  test('tolerance makes overlapping boxes NOT collide (tightens the check)', () => {
    // a and b overlap slightly (bTop=40 < aBottom=50)
    const a = { top: 0, left: 0, bottom: 50, right: 100 }
    const b = { top: 40, left: 40, bottom: 100, right: 100 }
    // Without tolerance: overlap exists → collision
    expect(objectsCollide(a, b, 0)).toBe(true)
    // tolerance=20: aBottom(50)-20=30 < bTop(40) → separated → no collision
    expect(objectsCollide(a, b, 20)).toBe(false)
  })
})

// ── getBoundsForNode ──────────────────────────────────────────────────────────
describe('Selection — getBoundsForNode', () => {
  test('returns the object itself when no getBoundingClientRect', () => {
    const node = { top: 10, left: 20, right: 100, bottom: 50 }
    expect(getBoundsForNode(node)).toBe(node)
  })

  test('calculates bounds for a real DOM node', () => {
    const node = document.createElement('div')
    document.body.appendChild(node)
    const bounds = getBoundsForNode(node)
    expect(bounds).toHaveProperty('top')
    expect(bounds).toHaveProperty('left')
    expect(bounds).toHaveProperty('right')
    expect(bounds).toHaveProperty('bottom')
    document.body.removeChild(node)
  })
})
