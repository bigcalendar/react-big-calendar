import PropTypes from 'prop-types'
import React from 'react'
import clsx from 'clsx'
import EventRowMixin from './EventRowMixin'
import { eventLevels } from './utils/eventLevels'
import range from 'lodash/range'

// Modified: Check if a segment spans through this slot (including events that started earlier)
let isSegmentInSlot = (seg, slot) => seg.left <= slot && seg.right >= slot
let eventsInSlot = (segments, slot) =>
  segments.filter((seg) => isSegmentInSlot(seg, slot)).map((seg) => seg.event)

class EventEndingRow extends React.Component {
  render() {
    let {
      segments,
      components,
      slotMetrics: { slots },
    } = this.props
    let rowSegments = eventLevels(segments).levels[0]
    // A custom showMore may already provide its own cell markup.
    let showMoreRole = components?.showMore ? undefined : 'cell'

    let current = 1,
      lastEnd = 1,
      row = []

    while (current <= slots) {
      let key = '_lvl_' + current

      // Find segment that starts at or spans through current slot
      let { event, left, right, span } =
        rowSegments.filter((seg) => isSegmentInSlot(seg, current))[0] || {} 

      if (!event) {
        // No visible event starts at this slot, but check if we need a "more" button
        // for hidden events that span this slot
        const hiddenEvents = this.getHiddenEventsForSlot(segments, current)
        if (hiddenEvents.length > 0) {
          let gap = current - lastEnd
          if (gap) {
            row.push(EventRowMixin.renderSpan(slots, gap, key + '_gap'))
          }
          row.push(
            EventRowMixin.renderSpan(
              slots,
              1,
              key,
              this.renderShowMore(segments, current),
              showMoreRole
            )
          )
          lastEnd = current = current + 1
          continue
        }
        
        current++
        continue
      }

      let gap = Math.max(0, left - lastEnd)

      if (this.canRenderSlotEvent(left, span)) {
        let content = EventRowMixin.renderEvent(this.props, event)

        if (gap) {
          row.push(EventRowMixin.renderSpan(slots, gap, key + '_gap'))
        }

        row.push(EventRowMixin.renderSpan(slots, span, key, content))

        lastEnd = current = right + 1
      } else {
        if (gap) {
          row.push(EventRowMixin.renderSpan(slots, gap, key + '_gap'))
        }

        row.push(
          EventRowMixin.renderSpan(
            slots,
            1,
            key,
            this.renderShowMore(segments, current),
            showMoreRole
          )
        )
        lastEnd = current = current + 1
      }
    }

    return <div className="rbc-row">{row}</div>
  }

  // New helper method to find hidden events for a slot
  getHiddenEventsForSlot(segments, slot) {
    // Get all events (visible and hidden) for this slot
    const allEventsInSlot = eventsInSlot(segments, slot)
    
    // Get visible events for this slot from the first level
    const rowSegments = eventLevels(segments).levels[0]
    const visibleEventsInSlot = rowSegments
      .filter(seg => isSegmentInSlot(seg, slot))
      .map(seg => seg.event)
    
    // Return events that are in allEventsInSlot but not in visibleEventsInSlot
    return allEventsInSlot.filter(
      event => !visibleEventsInSlot.some(visEvent => visEvent === event)
    )
  }

  canRenderSlotEvent(slot, span) {
    let { segments } = this.props

    return range(slot, slot + span).every((s) => {
      const count = eventsInSlot(segments, s).length

      return count === 1
    })
  }

  renderShowMore(segments, slot) {
    let { localizer, slotMetrics, components } = this.props
    const events = slotMetrics.getEventsForSlot(slot)
    const remainingEvents = eventsInSlot(segments, slot)
    const count = remainingEvents.length

    if (components?.showMore) {
      const ShowMore = components.showMore
      // The received slot seems to be 1-based, but the range we use to pull the date is 0-based
      const slotDate = slotMetrics.getDateForSlot(slot - 1)

      return count ? (
        <ShowMore
          localizer={localizer}
          slotDate={slotDate}
          slot={slot}
          count={count}
          events={events}
          remainingEvents={remainingEvents}
        />
      ) : (
        false
      )
    }

    return count ? (
      <button
        type="button"
        key={'sm_' + slot}
        className={clsx('rbc-button-link', 'rbc-show-more')}
        onClick={(e) => this.showMore(slot, e)}
      >
        {localizer.messages.showMore(count, remainingEvents, events)}
      </button>
    ) : (
      false
    )
  }

  showMore(slot, e) {
    e.preventDefault()
    e.stopPropagation()
    this.props.onShowMore(slot, e.target)
  }
}

EventEndingRow.propTypes = {
  segments: PropTypes.array,
  slots: PropTypes.number,
  onShowMore: PropTypes.func,
  ...EventRowMixin.propTypes,
}

EventEndingRow.defaultProps = {
  ...EventRowMixin.defaultProps,
}

export default EventEndingRow
