import clsx from 'clsx'
import PropTypes from 'prop-types'
import React, { createRef } from 'react'

import chunk from 'lodash/chunk'

import * as animationFrame from 'dom-helpers/animationFrame'
import getPosition from 'dom-helpers/position'
import { navigate, views } from './utils/constants'
import { notify } from './utils/helpers'

import DateContentRow from './DateContentRow'
import DateHeader from './DateHeader'
import Header from './Header'

import { inRange, sortWeekEvents } from './utils/eventLevels'

let eventsForWeek = (evts, start, end, accessors, localizer) =>
  evts.filter((e) => inRange(e, start, end, accessors, localizer))

class MonthView extends React.Component {
  constructor(...args) {
    super(...args)

    this.state = {
      rowLimit: 5,
      needLimitMeasure: true,
      date: null,
    }
    this.containerRef = createRef()
    this.slotRowRef = createRef()

    this._bgRows = []
    this._pendingSelection = []
  }

  static getDerivedStateFromProps({ date, localizer }, state) {
    return {
      date,
      needLimitMeasure:
        state.needLimitMeasure || localizer.neq(date, state.date, 'month'),
    }
  }

  componentDidMount() {
    let running

    if (this.state.needLimitMeasure) this.measureRowLimit(this.props)

    window.addEventListener(
      'resize',
      (this._resizeListener = () => {
        if (!running) {
          animationFrame.request(() => {
            running = false
            this.setState({ needLimitMeasure: true }) //eslint-disable-line
          })
        }
      }),
      false
    )
  }

  componentDidUpdate() {
    if (this.state.needLimitMeasure) this.measureRowLimit(this.props)
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener, false)
  }

  getContainer = () => {
    return this.containerRef.current
  }

  render() {
    let { date, localizer, className } = this.props,
      month = localizer.visibleDays(date, localizer),
      weeks = chunk(month, 7)

    this._weekCount = weeks.length

    return (
      <div
        className={clsx('rbc-month-view', className)}
        role="table"
        aria-label="Month View"
        ref={this.containerRef}
      >
        <div className="rbc-row rbc-month-header" role="row">
          {this.renderHeaders(weeks[0])}
        </div>
        {weeks.map(this.renderWeek)}
      </div>
    )
  }

  renderWeek = (week, weekIdx) => {
    let {
      events,
      components,
      selectable,
      getNow,
      selected,
      date,
      localizer,
      longPressThreshold,
      accessors,
      getters,
      showAllEvents,
    } = this.props

    const { needLimitMeasure, rowLimit } = this.state
    
    // let's not mutate props
    const weeksEvents = eventsForWeek(
      [...events],
      week[0],
      week[week.length - 1],
      accessors,
      localizer
    )

    const sorted = sortWeekEvents(weeksEvents, accessors, localizer)

    return (
      <DateContentRow
        key={weekIdx}
        ref={weekIdx === 0 ? this.slotRowRef : undefined}
        container={this.getContainer}
        className="rbc-month-row"
        getNow={getNow}
        date={date}
        range={week}
        events={sorted}
        maxRows={showAllEvents ? Infinity : rowLimit}
        selected={selected}
        selectable={selectable}
        components={components}
        accessors={accessors}
        getters={getters}
        localizer={localizer}
        renderHeader={this.readerDateHeading}
        renderForMeasure={needLimitMeasure}
        onShowMore={this.handleShowMore}
        onSelect={this.handleSelectEvent}
        onDoubleClick={this.handleDoubleClickEvent}
        onKeyPress={this.handleKeyPressEvent}
        onSelectSlot={this.handleSelectSlot}
        longPressThreshold={longPressThreshold}
        rtl={this.props.rtl}
        resizable={this.props.resizable}
        showAllEvents={showAllEvents}
      />
    )
  }

  readerDateHeading = ({ date, className, ...props }) => {
    let { date: currentDate, getDrilldownView, localizer } = this.props
    let isOffRange = localizer.neq(currentDate, date, 'month')
    let isCurrent = localizer.isSameDate(date, currentDate)
    let drilldownView = getDrilldownView(date)
    let label = localizer.format(date, 'dateFormat')
    let DateHeaderComponent = this.props.components.dateHeader || DateHeader

    return (
      <div
        {...props}
        className={clsx(
          className,
          isOffRange && 'rbc-off-range',
          isCurrent && 'rbc-current'
        )}
        role="cell"
      >
        <DateHeaderComponent
          label={label}
          date={date}
          drilldownView={drilldownView}
          isOffRange={isOffRange}
          onDrillDown={(e) => this.handleHeadingClick(date, drilldownView, e)}
        />
      </div>
    )
  }

  renderHeaders(row) {
    let { localizer, components } = this.props
    let first = row[0]
    let last = row[row.length - 1]
    let HeaderComponent = components.header || Header

    return localizer.range(first, last, 'day').map((day, idx) => (
      <div key={'header_' + idx} className="rbc-header">
        <HeaderComponent
          date={day}
          localizer={localizer}
          label={localizer.format(day, 'weekdayFormat')}
        />
      </div>
    ))
  }

  measureRowLimit() {
    this.setState({
      needLimitMeasure: false,
      rowLimit: this.slotRowRef.current.getRowLimit(),
    })
  }

  handleSelectSlot = (range, slotInfo) => {
    this._pendingSelection = this._pendingSelection.concat(range)

    clearTimeout(this._selectTimer)
    this._selectTimer = setTimeout(() => this.selectDates(slotInfo))
  }

  handleHeadingClick = (date, view, e) => {
    e.preventDefault()
    this.clearSelection()
    notify(this.props.onDrillDown, [date, view])
  }

  handleSelectEvent = (...args) => {
    this.clearSelection()
    notify(this.props.onSelectEvent, args)
  }

  handleDoubleClickEvent = (...args) => {
    this.clearSelection()
    notify(this.props.onDoubleClickEvent, args)
  }

  handleKeyPressEvent = (...args) => {
    this.clearSelection()
    notify(this.props.onKeyPressEvent, args)
  }

  handleShowMore = (events, date, cell, slot, target) => {
    const {
      popup,
      onDrillDown,
      onShowMore,
      getDrilldownView,
      doShowMoreDrillDown,
      accessors,
      localizer,
      components,
      getters,
      selected,
      handleDragStart,
    } = this.props
    //cancel any pending selections so only the event click goes through.
    this.clearSelection()

    if (popup) {
      let position = getPosition(cell, this.containerRef.current)

      if (window.showCalendarOverlay) {
        window.showCalendarOverlay({
          date,
          events,
          position,
          target,
          accessors,
          localizer,
          components,
          getters,
          selected,
          onSelect: this.handleSelectEvent,
          onDoubleClick: this.handleDoubleClickEvent,
          onKeyPress: this.handleKeyPressEvent,
          handleDragStart,
          containerRef: this.containerRef,
          popupOffset: this.props.popupOffset,
          onHide: () => {
            if (window.hideCalendarOverlay) {
              window.hideCalendarOverlay()
            }
          }
        })
      }
    } else if (doShowMoreDrillDown) {
      notify(onDrillDown, [date, getDrilldownView(date) || views.DAY])
    }

    notify(onShowMore, [events, date, slot])
  }

  selectDates(slotInfo) {
    let slots = this._pendingSelection.slice()

    this._pendingSelection = []

    slots.sort((a, b) => +a - +b)

    const start = new Date(slots[0])
    const end = new Date(slots[slots.length - 1])
    end.setDate(slots[slots.length - 1].getDate() + 1)

    notify(this.props.onSelectSlot, {
      slots,
      start,
      end,
      action: slotInfo.action,
      bounds: slotInfo.bounds,
      box: slotInfo.box,
    })
  }

  clearSelection() {
    clearTimeout(this._selectTimer)
    this._pendingSelection = []
  }
}

MonthView.propTypes = {
  events: PropTypes.array.isRequired,
  date: PropTypes.instanceOf(Date),

  min: PropTypes.instanceOf(Date),
  max: PropTypes.instanceOf(Date),

  step: PropTypes.number,
  getNow: PropTypes.func.isRequired,

  scrollToTime: PropTypes.instanceOf(Date),
  enableAutoScroll: PropTypes.bool,
  rtl: PropTypes.bool,
  resizable: PropTypes.bool,
  width: PropTypes.number,

  accessors: PropTypes.object.isRequired,
  components: PropTypes.object.isRequired,
  getters: PropTypes.object.isRequired,
  localizer: PropTypes.object.isRequired,

  selected: PropTypes.object,
  selectable: PropTypes.oneOf([true, false, 'ignoreEvents']),
  longPressThreshold: PropTypes.number,

  onNavigate: PropTypes.func,
  onSelectSlot: PropTypes.func,
  onSelectEvent: PropTypes.func,
  onDoubleClickEvent: PropTypes.func,
  onKeyPressEvent: PropTypes.func,
  onShowMore: PropTypes.func,
  showAllEvents: PropTypes.bool,
  doShowMoreDrillDown: PropTypes.bool,
  onDrillDown: PropTypes.func,
  getDrilldownView: PropTypes.func.isRequired,

  popup: PropTypes.bool,
  handleDragStart: PropTypes.func,

  popupOffset: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number,
    }),
  ]),
}

MonthView.range = (date, { localizer }) => {
  let start = localizer.firstVisibleDay(date, localizer)
  let end = localizer.lastVisibleDay(date, localizer)
  return { start, end }
}

MonthView.navigate = (date, action, { localizer }) => {
  switch (action) {
    case navigate.PREVIOUS:
      return localizer.add(date, -1, 'month')

    case navigate.NEXT:
      return localizer.add(date, 1, 'month')

    default:
      return date
  }
}

MonthView.title = (date, { localizer }) =>
  localizer.format(date, 'monthHeaderFormat')

export default MonthView