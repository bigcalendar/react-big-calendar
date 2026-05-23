import clsx from 'clsx'
import getHeight from 'dom-helpers/height'
import qsa from 'dom-helpers/querySelectorAll'
import PropTypes from 'prop-types'
import React, { createRef } from 'react'

import BackgroundCells from './BackgroundCells'
import EventEndingRow from './EventEndingRow'
import EventRow from './EventRow'
import NoopWrapper from './NoopWrapper'
import ScrollableWeekWrapper from './ScrollableWeekWrapper'
import * as DateSlotMetrics from './utils/DateSlotMetrics'

class DateContentRow extends React.Component {
  constructor(...args) {
    super(...args)

    this.containerRef = createRef()
    this.headingRowRef = createRef()
    this.eventRowRef = createRef()

    this.slotMetrics = DateSlotMetrics.getSlotMetrics()
  }

  handleSelectSlot = (slot) => {
    const { range, onSelectSlot } = this.props

    onSelectSlot(range.slice(slot.start, slot.end + 1), slot)
  }

  handleShowMore = (slot, target) => {
    const { range, onShowMore } = this.props
    let metrics = this.slotMetrics(this.props)
    let row = qsa(this.containerRef.current, '.rbc-row-bg')[0]

    let cell
    if (row) cell = row.children[slot - 1]

    let events = metrics.getEventsForSlot(slot)
    onShowMore(events, range[slot - 1], cell, slot, target)
  }

  getContainer = () => {
    const { container } = this.props
    return container ? container() : this.containerRef.current
  }

  getRowLimit() {
    /* Guessing this only gets called on the dummyRow */
    const eventHeight = getHeight(this.eventRowRef.current)
    const headingHeight = this.headingRowRef?.current
      ? getHeight(this.headingRowRef.current)
      : 0
    const eventSpace = getHeight(this.containerRef.current) - headingHeight

    return Math.max(Math.floor(eventSpace / eventHeight), 1)
  }

  renderHeadingCell = (date, index) => {
    let { renderHeader, getNow, localizer } = this.props

    return renderHeader({
      date,
      key: `header_${index}`,
      className: clsx(
        'rbc-date-cell',
        localizer.isSameDate(date, getNow()) && 'rbc-now'
      ),
    })
  }

  renderDummy = () => {
    let { className, range, renderHeader, showAllEvents } = this.props
    return (
      <div className={className} ref={this.containerRef}>
        <div
          className={clsx(
            'rbc-row-content',
            showAllEvents && 'rbc-row-content-scrollable'
          )}
        >
          {renderHeader && (
            <div className="rbc-row" ref={this.headingRowRef}>
              {range.map(this.renderHeadingCell)}
            </div>
          )}
          <div className="rbc-row" ref={this.eventRowRef}>
            <div className="rbc-row-segment">
              <div className="rbc-event">
                <div className="rbc-event-content">&nbsp;</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  render() {
    const {
      date,
      rtl,
      range,
      className,
      selected,
      selectable,
      renderForMeasure,

      accessors,
      getters,
      components,

      getNow,
      renderHeader,
      onSelect,
      localizer,
      onSelectStart,
      onSelectEnd,
      onDoubleClick,
      onKeyPress,
      resourceId,
      longPressThreshold,
      isAllDay,
      resizable,
      showAllEvents,
    } = this.props

    if (renderForMeasure) return this.renderDummy()

    let metrics = this.slotMetrics(this.props)
    let { levels, extra } = metrics

    let ScrollableWeekComponent = showAllEvents
      ? ScrollableWeekWrapper
      : NoopWrapper
    let WeekWrapper = components.weekWrapper

    const eventRowProps = {
      selected,
      accessors,
      getters,
      localizer,
      components,
      onSelect,
      onDoubleClick,
      onKeyPress,
      resourceId,
      slotMetrics: metrics,
      resizable,
    }

    return (
      <div className={className} role="rowgroup" ref={this.containerRef}>
        <BackgroundCells
          localizer={localizer}
          date={date}
          getNow={getNow}
          rtl={rtl}
          range={range}
          selectable={selectable}
          container={this.getContainer}
          getters={getters}
          onSelectStart={onSelectStart}
          onSelectEnd={onSelectEnd}
          onSelectSlot={this.handleSelectSlot}
          components={components}
          longPressThreshold={longPressThreshold}
          resourceId={resourceId}
        />

        <div
          className={clsx(
            'rbc-row-content',
            showAllEvents && 'rbc-row-content-scrollable'
          )}
          role="row"
        >
          {renderHeader && (
            <div className="rbc-row " ref={this.headingRowRef}>
              {range.map(this.renderHeadingCell)}
            </div>
          )}
          <ScrollableWeekComponent>
            <WeekWrapper isAllDay={isAllDay} {...eventRowProps} rtl={this.props.rtl}>
              {levels.map((segs, idx) => (
                <EventRow key={idx} segments={segs} {...eventRowProps} />
              ))}
              {!!extra.length && (
                <EventEndingRow
                  segments={extra}
                  onShowMore={this.handleShowMore}
                  {...eventRowProps}
                />
              )}
            </WeekWrapper>
          </ScrollableWeekComponent>
        </div>
      </div>
    )
  }
}

DateContentRow.propTypes = {
  date: PropTypes.instanceOf(Date),
  events: PropTypes.array.isRequired,
  range: PropTypes.array.isRequired,

  rtl: PropTypes.bool,
  resizable: PropTypes.bool,
  resourceId: PropTypes.any,
  renderForMeasure: PropTypes.bool,
  renderHeader: PropTypes.func,

  container: PropTypes.func,
  selected: PropTypes.object,
  selectable: PropTypes.oneOf([true, false, 'ignoreEvents']),
  longPressThreshold: PropTypes.number,

  onShowMore: PropTypes.func,
  showAllEvents: PropTypes.bool,
  onSelectSlot: PropTypes.func,
  onSelect: PropTypes.func,
  onSelectEnd: PropTypes.func,
  onSelectStart: PropTypes.func,
  onDoubleClick: PropTypes.func,
  onKeyPress: PropTypes.func,
  dayPropGetter: PropTypes.func,

  getNow: PropTypes.func.isRequired,
  isAllDay: PropTypes.bool,

  accessors: PropTypes.object.isRequired,
  components: PropTypes.object.isRequired,
  getters: PropTypes.object.isRequired,
  localizer: PropTypes.object.isRequired,

  minRows: PropTypes.number.isRequired,
  maxRows: PropTypes.number.isRequired,
}

DateContentRow.defaultProps = {
  minRows: 0,
  maxRows: Infinity,
}

export default DateContentRow