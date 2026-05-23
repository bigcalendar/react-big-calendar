import memoize from 'memoize-one'
import { endOfRange, eventLevels, eventSegments } from './eventLevels'

let isSegmentInSlot = (seg, slot) => seg.left <= slot && seg.right >= slot

const isEqual = (a, b) =>
  a[0].range === b[0].range && a[0].events === b[0].events

export function getSlotMetrics() {
  return memoize((options) => {
    const { range, events, maxRows, minRows, accessors, localizer } = options
    let { first, last } = endOfRange({ dateRange: range, localizer })

    let segments = events.map((evt) =>
      eventSegments(evt, range, accessors, localizer)
    )

    let { levels, extra } = eventLevels(segments, Math.max(maxRows - 1, 1))
    // Subtract 1 from minRows to not include showMore button row when
    // it would be rendered
    
    const minEventRows = extra.length > 0 ? minRows - 1 : minRows
    while (levels.length < minEventRows) levels.push([])

    return {
      first,
      last,
      levels,
      extra,
      range,
      slots: range.length,

      clone(args) {
        const metrics = getSlotMetrics()
        return metrics({ ...options, ...args })
      },

      getDateForSlot(slotNumber) {
        return range[slotNumber]
      },

      getSlotForDate(date) {
        return range.find((r) => localizer.isSameDate(r, date))
      },

      getEventsForSlot(slot) {
        return segments
          .filter((seg) => isSegmentInSlot(seg, slot))
          .map((seg) => seg.event)
      },

      continuesPrior(event) {
        return localizer.continuesPrior(accessors.start(event), first)
      },

      continuesAfter(event) {
        const start = accessors.start(event)
        const end = accessors.end(event)
        return localizer.continuesAfter(start, end, last)
      },
    }
  }, isEqual)
}