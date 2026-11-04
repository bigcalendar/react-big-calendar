import PropTypes from 'prop-types'
import React from 'react'
import EventRow from '../../EventRow'
import Selection, { getBoundsForNode } from '../../Selection'
import { eventSegments } from '../../utils/eventLevels'
import { getSlotAtX, pointInBox } from '../../utils/selection'
import { dragAccessors, eventTimes } from './common'
import { DnDContext } from './DnDContext'

class WeekWrapper extends React.Component {
  static propTypes = {
    isAllDay: PropTypes.bool,
    slotMetrics: PropTypes.object.isRequired,
    accessors: PropTypes.object.isRequired,
    getters: PropTypes.object.isRequired,
    components: PropTypes.object.isRequired,
    resourceId: PropTypes.any,
    rtl: PropTypes.bool,
    localizer: PropTypes.any,
  }

  static contextType = DnDContext

  constructor(...args) {
    super(...args)
    this.state = {}
    this.ref = React.createRef()
  }

  componentDidMount() {
    this._selectable()
  }

  componentWillUnmount() {
    this._teardownSelectable()
  }

  reset() {
    if (this.state.segment) this.setState({ segment: null })
  }

  update(event, start, end) {
    const segment = eventSegments(
      { ...event, end, start, __isPreview: true },
      this.props.slotMetrics.range,
      dragAccessors,
      this.props.localizer
    )

    const { segment: lastSegment } = this.state
    if (
      lastSegment &&
      segment.span === lastSegment.span &&
      segment.left === lastSegment.left &&
      segment.right === lastSegment.right
    ) {
      return
    }
    this.setState({ segment })
  }

  handleMove = (point, bounds, draggedEvent) => {
    if (!pointInBox(bounds, point)) return this.reset()
    const event = this.context.draggable.dragAndDropAction.event || draggedEvent
    const { accessors, slotMetrics, rtl, localizer } = this.props

    const slot = getSlotAtX(bounds, point.x, rtl, slotMetrics.slots)

    const date = slotMetrics.getDateForSlot(slot)

    // Adjust the dates, but maintain the times when moving
    let { start, duration } = eventTimes(event, accessors, localizer)
    start = localizer.merge(date, start)
    const end = localizer.add(start, duration, 'milliseconds')
    // LATER: when dragging a multi-row event, only the first row is animating
    this.update(event, start, end)
  }

  handleDropFromOutside = (point, bounds) => {
    if (!this.context.draggable.onDropFromOutside) return
    const { slotMetrics, rtl, localizer } = this.props

    const slot = getSlotAtX(bounds, point.x, rtl, slotMetrics.slots)
    const start = slotMetrics.getDateForSlot(slot)

    this.context.draggable.onDropFromOutside({
      start,
      end: localizer.add(start, 1, 'day'),
      allDay: false,
    })
  }

  handleDragOverFromOutside = (point, node) => {
    const item = this.context.draggable.dragFromOutsideItem ? this.context.draggable.dragFromOutsideItem() : null
    if (!item) return
    this.handleMove(point, node, item)
  }

  handleResize(point, bounds) {
    const { event, direction } = this.context.draggable.dragAndDropAction
    const { accessors, slotMetrics, rtl, localizer } = this.props

    let { start, end } = eventTimes(event, accessors, localizer)

    const slot = Math.max(
      0,
      Math.min(slotMetrics.slots - 1, getSlotAtX(bounds, point.x, rtl, slotMetrics.slots))
    )
    const date = slotMetrics.getDateForSlot(slot)
    // Keep the preview at the nearest edge while the pointer is beside this row.
    const cursorInRow = point.y >= bounds.top && point.y <= bounds.bottom

    if (direction === 'RIGHT') {
      if (cursorInRow) {
        if (slotMetrics.last < start) return this.reset()
        if (localizer.eq(localizer.startOf(end, 'day'), end))
          end = localizer.add(date, 1, 'day')
        else end = date
      } else if (
        localizer.inRange(start, slotMetrics.first, slotMetrics.last) ||
        (bounds.bottom < point.y && +slotMetrics.first > +start)
      ) {
        end = localizer.add(slotMetrics.last, 1, 'milliseconds')
      } else {
        this.setState({ segment: null })
        return
      }
      const originalEnd = accessors.end(event)
      end = localizer.merge(end, originalEnd)
      if (localizer.lt(end, start)) {
        end = originalEnd
      }
    } else if (direction === 'LEFT') {
      if (cursorInRow) {
        if (slotMetrics.first > end) return this.reset()
        start = date
      } else if (
        localizer.inRange(end, slotMetrics.first, slotMetrics.last) ||
        (bounds.top > point.y && localizer.lt(slotMetrics.last, end))
      ) {
        start = localizer.add(slotMetrics.first, -1, 'milliseconds')
      } else {
        this.reset()
        return
      }
      const originalStart = accessors.start(event)
      start = localizer.merge(start, originalStart)
      if (localizer.gt(start, end)) {
        start = originalStart
      }
    }

    this.update(event, start, end)
  }

  _selectable = () => {
    let node = this.ref.current.closest('.rbc-month-row, .rbc-allday-cell')
    let container = node.closest('.rbc-month-view, .rbc-time-view')
    let isMonthRow = node.classList.contains('rbc-month-row')

    // Valid container check only necessary in TimeGrid views
    let selector = (this._selector = new Selection(() => container, {
      validContainers: [
        ...(!isMonthRow ? ['.rbc-day-slot', '.rbc-allday-cell'] : []),
      ],
    }))

    selector.on('beforeSelect', (point) => {
      const { isAllDay } = this.props
      const { action } = this.context.draggable.dragAndDropAction
      const bounds = getBoundsForNode(node)
      const isInBox = pointInBox(bounds, point)
      return (
        action === 'move' || (action === 'resize' && (!isAllDay || isInBox))
      )
    })

    selector.on('selecting', (box) => {
      const bounds = getBoundsForNode(node)
      const { dragAndDropAction } = this.context.draggable
      if (dragAndDropAction.action === 'move') this.handleMove(box, bounds)
      if (dragAndDropAction.action === 'resize') this.handleResize(box, bounds)
    })

    selector.on('selectStart', () => this.context.draggable.onStart())

    selector.on('select', (point) => {
      const bounds = getBoundsForNode(node)
      if (!this.state.segment) return
      if (!pointInBox(bounds, point)) {
        this.reset()
      } else {
        this.handleInteractionEnd()
      }
    })

    selector.on('dropFromOutside', (point) => {
      if (!this.context.draggable.onDropFromOutside) return
      const bounds = getBoundsForNode(node)
      if (!pointInBox(bounds, point)) return
      this.handleDropFromOutside(point, bounds)
    })

    selector.on('dragOverFromOutside', (point) => {
      if (!this.context.draggable.dragFromOutsideItem) return
      const bounds = getBoundsForNode(node)

      this.handleDragOverFromOutside(point, bounds)
    })

    selector.on('click', () => this.context.draggable.onEnd(null))

    selector.on('reset', () => {
      this.reset()
      this.context.draggable.onEnd(null)
    })
  }

  handleInteractionEnd = () => {
    const { resourceId, isAllDay } = this.props
    const { event } = this.state.segment

    this.reset()

    this.context.draggable.onEnd({
      start: event.start,
      end: event.end,
      resourceId,
      isAllDay,
    })
  }

  _teardownSelectable = () => {
    if (!this._selector) return
    this._selector.teardown()
    this._selector = null
  }

  render() {
    const { children, accessors } = this.props

    let { segment } = this.state

    return (
      <div ref={this.ref} className="rbc-addons-dnd-row-body">
        {children}

        {segment && (
          <EventRow
            {...this.props}
            selected={null}
            className="rbc-addons-dnd-drag-row"
            segments={[segment]}
            accessors={{
              ...accessors,
              ...dragAccessors,
            }}
          />
        )}
      </div>
    )
  }
}

export default WeekWrapper
