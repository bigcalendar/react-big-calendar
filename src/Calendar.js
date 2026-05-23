import clsx from 'clsx'
import PropTypes from 'prop-types'
import React from 'react'
import { uncontrollable } from 'uncontrollable'
import {
  accessor,
  views as componentViews,
  dateFormat,
  dateRangeFormat,
  DayLayoutAlgorithmPropType,
} from './utils/propTypes'

import { mergeWithDefaults } from './localizer'
import NoopWrapper from './NoopWrapper'
import Toolbar from './Toolbar'
import { navigate, views } from './utils/constants'
import { notify } from './utils/helpers'
import message from './utils/messages'
import moveDate from './utils/move'
import VIEWS from './Views'
import IsolatedOverlayManager from './IsolatedOverlayManager'

import defaults from 'lodash/defaults'
import mapValues from 'lodash/mapValues'
import omit from 'lodash/omit'
import transform from 'lodash/transform'
import { wrapAccessor } from './utils/accessors'

function viewNames(_views) {
  if (Array.isArray(_views)) {
    return _views
  }
  const views = []
  for (const [key, value] of Object.entries(_views)) {
    if (value) {
      views.push(key)
    }
  }
  return views
}

function isValidView(view, { views: _views }) {
  let names = viewNames(_views)
  return names.indexOf(view) !== -1
}

class Calendar extends React.Component {
  static propTypes = {
    /**
     * The localizer used for formatting dates and times according to the `format` and `culture`
     *
     * globalize
     * ```js
     * import {globalizeLocalizer} from 'react-big-calendar'
     * import globalize from 'globalize'
     *
     * const localizer = globalizeLocalizer(globalize)
     * ```
     * moment
     * ``js
     * import {momentLocalizer} from 'react-big-calendar'
     * import moment from 'moment'
     * // and, for optional time zone support
     * import 'moment-timezone'
     *
     * moment.tz.setDefault('America/Los_Angeles')
     * // end optional time zone support
     *
     * const localizer = momentLocalizer(moment)
     * ```
     *
     * Luxon
     * ```js
     * import {luxonLocalizer} from 'react-big-calendar'
     * import {DateTime, Settings} from 'luxon'
     * // only use `Settings` if you require optional time zone support
     * Settings.defaultZone = 'America/Los_Angeles'
     * // end optional time zone support
     *
     * // Luxon uses the Intl API, which currently does not contain `weekInfo`
     * // to determine which weekday is the start of the week by `culture`.
     * // The `luxonLocalizer` defaults this to Sunday, which differs from
     * // the Luxon default of Monday. The localizer requires this option
     * // to change the display, and the date math for determining the
     * // start of a week. Luxon uses non-zero based values for `weekday`.
     * const localizer = luxonLocalizer(DateTime, {firstDayOfWeek: 7})
     * ```
     */
    localizer: PropTypes.object.isRequired,

    /**
     * Props passed to main calendar `<div>`.
     *
     */
    elementProps: PropTypes.object,

    /**
     * The current date value of the calendar. Determines the visible view range.
     * If `date` is omitted then the result of `getNow` is used; otherwise the
     * current date is used.
     *
     * @controllable onNavigate
     */
    date: PropTypes.instanceOf(Date),

    /**
     * The current view of the calendar.
     *
     * @default 'month'
     * @controllable onView
     */
    view: PropTypes.string,

    /**
     * The initial view set for the Calendar.
     * @type Calendar.Views ('month'|'week'|'work_week'|'day'|'agenda')
     * @default 'month'
     */
    defaultView: PropTypes.string,

    /**
     * An array of event objects to display on the calendar. Events objects
     * can be any shape, as long as the Calendar knows how to retrieve the
     * following details of the event:
     *
     *  - start time
     *  - end time
     *  - title
     *  - whether its an "all day" event or not
     *  - any resource the event may be related to
     *
     * Each of these properties can be customized or generated dynamically by
     * setting the various "accessor" props. Without any configuration the default
     * event should look like:
     *
     * ```js
     * Event {
     *   title: string,
     *   start: Date,
     *   end: Date,
     *   allDay?: boolean
     *   resource?: any,
     * }
     * ```
     */
    events: PropTypes.arrayOf(PropTypes.object),

    /**
     * An array of background event objects to display on the calendar. Background
     * Events behave similarly to Events but are not factored into Event overlap logic,
     * allowing them to sit behind any Events that may occur during the same period.
     * Background Events objects can be any shape, as long as the Calendar knows how to
     * retrieve the following details of the event:
     *
     *  - start time
     *  - end time
     *
     * Each of these properties can be customized or generated dynamically by
     * setting the various "accessor" props. Without any configuration the default
     * event should look like:
     *
     * ```js
     * BackgroundEvent {
     *   start: Date,
     *   end: Date,
     * }
     * ```
     */
    backgroundEvents: PropTypes.arrayOf(PropTypes.object),

    /**
     * Accessor for the event title, used to display event information. Should
     * resolve to a `renderable` value.
     *
     * ```js
     * string | (event: Object) => string
     * ```
     *
     * @type {(func|string)}
     */
    titleAccessor: accessor,

    /**
     * Accessor for the event tooltip. Should
     * resolve to a `renderable` value. Removes the tooltip if null.
     *
     * ```js
     * string | (event: Object) => string
     * ```
     *
     * @type {(func|string)}
     */
    tooltipAccessor: accessor,

    /**
     * Determines whether the event should be considered an "all day" event and ignore time.
     * Must resolve to a `boolean` value.
     *
     * ```js
     * string | (event: Object) => boolean
     * ```
     *
     * @type {(func|string)}
     */
    allDayAccessor: accessor,

    /**
     * The start date/time of the event. Must resolve to a JavaScript `Date` object.
     *
     * ```js
     * string | (event: Object) => Date
     * ```
     *
     * @type {(func|string)}
     */
    startAccessor: accessor,

    /**
     * The end date/time of the event. Must resolve to a JavaScript `Date` object.
     *
     * ```js
     * string | (event: Object) => Date
     * ```
     *
     * @type {(func|string)}
     */
    endAccessor: accessor,

    /**
     * The id of the event. Must resolve to a string or number. Used as the key for the event in the DOM. If not provided, the event will be given a key of 'evt\_{index}'.
     *
     * ```js
     * string | number | (event: Object) => string | number
     * ```
     *
     * @type {(func|string)}
     */
    eventIdAccessor: accessor,

    /**
     * Returns the id of the `resource` that the event is a member of. This
     * id should match at least one resource in the `resources` array.
     *
     * ```js
     * string | (event: Object) => Date
     * ```
     *
     * @type {(func|string)}
     */
    resourceAccessor: accessor,

    /**
     * An array of resource objects that map events to a specific resource.
     * Resource objects, like events, can be any shape or have any properties,
     * but should be uniquly identifiable via the `resourceIdAccessor`, as
     * well as a "title" or name as provided by the `resourceTitleAccessor` prop.
     */
    resources: PropTypes.arrayOf(PropTypes.object),

    /**
     * Provides a unique identifier, or an array of unique identifiers, for each resource in the `resources` array
     *
     * ```js
     * string | (resource: Object) => any
     * ```
     *
     * @type {(func|string)}
     */
    resourceIdAccessor: accessor,

    /**
     * Provides a human readable name for the resource object, used in headers.
     *
     * ```js
     * string | (resource: Object) => any
     * ```
     *
     * @type {(func|string)}
     */
    resourceTitleAccessor: accessor,

    /**
     * Determines the current date/time which is highlighted in the views.
     *
     * The value affects which day is shaded and which time is shown as
     * the current time. It also affects the date used by the Today button in
     * the toolbar.
     *
     * Providing a value here can be useful when you are implementing time zones
     * using the `startAccessor` and `endAccessor` properties.
     *
     * @type {func}
     * @default () => new Date()
     */
    getNow: PropTypes.func,

    /**
     * Callback fired when the `date` value changes.
     *
     * @controllable date
     */
    onNavigate: PropTypes.func,

    /**
     * Callback fired when the `view` value changes.
     *
     * @controllable view
     */
    onView: PropTypes.func,

    /**
     * Callback fired when date header, or the truncated events links are clicked
     *
     */
    onDrillDown: PropTypes.func,

    /**
     *
     * ```js
     * (dates: Date[] | { start: Date; end: Date }, view: 'month'|'week'|'work_week'|'day'|'agenda'|undefined) => void
     * ```
     *
     * Callback fired when the visible date range changes. Returns an Array of dates
     * or an object with start and end dates for BUILTIN views. Optionally new `view`
     * will be returned when callback called after view change.
     *
     * Custom views may return something different.
     */
    onRangeChange: PropTypes.func,

    /**
     * A callback fired when a date selection is made. Only fires when `selectable` is `true`.
     *
     * ```js
     * (
     *   slotInfo: {
     *     start: Date,
     *     end: Date,
     *     resourceId:  (number|string),
     *     slots: Array<Date>,
     *     action: "select" | "click" | "doubleClick",
     *     bounds: ?{ // For "select" action
     *       x: number,
     *       y: number,
     *       top: number,
     *       right: number,
     *       left: number,
     *       bottom: number,
     *     },
     *     box: ?{ // For "click" or "doubleClick" actions
     *       clientX: number,
     *       clientY: number,
     *       x: number,
     *       y: number,
     *     },
     *   }
     * ) => any
     * ```
     */
    onSelectSlot: PropTypes.func,

    /**
     * Callback fired when a calendar event is selected.
     *
     * ```js
     * (event: Object, e: SyntheticEvent) => any
     * ```
     *
     * @controllable selected
     */
    onSelectEvent: PropTypes.func,

    /**
     * Callback fired when a calendar event is clicked twice.
     *
     * ```js
     * (event: Object, e: SyntheticEvent) => void
     * ```
     */
    onDoubleClickEvent: PropTypes.func,

    /**
     * Callback fired when a focused calendar event receives a key press.
     *
     * ```js
     * (event: Object, e: SyntheticEvent) => void
     * ```
     */
    onKeyPressEvent: PropTypes.func,

    /**
     * Callback fired when dragging a selection in the Time views.
     *
     * Returning `false` from the handler will prevent a selection.
     *
     * ```js
     * (range: { start: Date, end: Date, resourceId: (number|string) }) => ?boolean
     * ```
     */
    onSelecting: PropTypes.func,

    /**
     * Callback fired when a +{count} more is clicked
     *
     * ```js
     * (events: Object, date: Date) => any
     * ```
     */
    onShowMore: PropTypes.func,

    /**
     * Displays all events on the month view instead of
     * having some hidden behind +{count} more. This will
     * cause the rows in the month view to be scrollable if
     * the number of events exceed the height of the row.
     */
    showAllEvents: PropTypes.bool,

    /**
     * The selected event, if any.
     */
    selected: PropTypes.object,

    /**
     * An array of built-in view names to allow the calendar to display.
     * accepts either an array of builtin view names,
     *
     * ```jsx
     * views={['month', 'day', 'agenda']}
     * ```
     * or an object hash of the view name and the component (or boolean for builtin).
     *
     * ```jsx
     * views={{
     *   month: true,
     *   week: false,
     *   myweek: WorkWeekViewComponent,
     * }}
     * ```
     *
     * Custom views can be any React component, that implements the following
     * interface:
     *
     * ```js
     * interface View {
     *   static title(date: Date, { formats: DateFormat[], culture: string?, ...props }): string
     *   static navigate(date: Date, action: 'PREV' | 'NEXT' | 'DATE'): Date
     * }
     * ```
     *
     * @type Views ('month'|'week'|'work_week'|'day'|'agenda')
     * @View
     ['month', 'week', 'day', 'agenda']
     */
    views: componentViews,

    /**
     * Determines whether the drill down should occur when clicking on the "+_x_ more" link.
     * If `popup` is false, and `doShowMoreDrillDown` is true, the drill down will occur as usual.
     * If `popup` is false, and `doShowMoreDrillDown` is false, the drill down will not occur and the `onShowMore` function will trigger.
     */
    doShowMoreDrillDown: PropTypes.bool,

    /**
     * The string name of the destination view for drill-down actions, such
     * as clicking a date header, or the truncated events links. If
     * `getDrilldownView` is also specified it will be used instead.
     *
     * Set to `null` to disable drill-down actions.
     *
     * ```js
     * <Calendar
     *   drilldownView="agenda"
     * />
     * ```
     */
    drilldownView: PropTypes.string,

    /**
     * Functionally equivalent to `drilldownView`, but accepts a function
     * that can return a view name. It's useful for customizing the drill-down
     * actions depending on the target date and triggering view.
     *
     * Return `null` to disable drill-down actions.
     *
     * ```js
     * <Calendar
     *   getDrilldownView={(targetDate, currentViewName, configuredViewNames) =>
     *     if (currentViewName === 'month' && configuredViewNames.includes('week'))
     *       return 'week'
     *
     *     return null;
     *   }}
     * />
     * ```
     */
    getDrilldownView: PropTypes.func,

    /**
     * Determines the end date from date prop in the agenda view
     * date prop + length (in number of days) = end date
     */
    length: PropTypes.number,

    /**
     * Determines whether the toolbar is displayed
     */
    toolbar: PropTypes.bool,

    /**
     * Show truncated events in an overlay when you click the "+_x_ more" link.
     */
    popup: PropTypes.bool,

    /**
     * Distance in pixels, from the edges of the viewport, the "show more" overlay should be positioned.
     *
     * ```jsx
     * <Calendar popupOffset={30}/>
     * <Calendar popupOffset={{x: 30, y: 20}}/>
     * ```
     */
    popupOffset: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
    ]),

    /**
     * Allows mouse selection of ranges of dates/times.
     *
     * The 'ignoreEvents' option prevents selection code from running when a
     * drag begins over an event. Useful when you want custom event click or drag
     * logic
     */
    selectable: PropTypes.oneOf([true, false, 'ignoreEvents']),

    /**
     * Specifies the number of milliseconds the user must press and hold on the screen for a touch
     * to be considered a "long press." Long presses are used for time slot selection on touch
     * devices.
     *
     * @type {number}
     * @default 250
     */
    longPressThreshold: PropTypes.number,

    /**
     * Determines the selectable time increments in week and day views, in minutes.
     */
    step: PropTypes.number,

    /**
     * The number of slots per "section" in the time grid views. Adjust with `step`
     * to change the default of 1 hour long groups, with 30 minute slots.
     */
    timeslots: PropTypes.number,

    /**
     *Switch the calendar to a `right-to-left` read direction.
     */
    rtl: PropTypes.bool,

    /**
     * Optionally provide a function that returns an object of className or style props
     * to be applied to the the event node.
     *
     * ```js
     * (
     * 	event: Object,
     * 	start: Date,
     * 	end: Date,
     * 	isSelected: boolean
     * ) => { className?: string, style?: Object }
     * ```
     */
    eventPropGetter: PropTypes.func,

    /**
     * Optionally provide a function that returns an object of className or style props
     * to be applied to the time-slot node. Caution! Styles that change layout or
     * position may break the calendar in unexpected ways.
     *
     * ```js
     * (date: Date, resourceId: (number|string)) => { className?: string, style?: Object }
     * ```
     */
    slotPropGetter: PropTypes.func,

    /**
     * Optionally provide a function that returns an object of props to be applied
     * to the time-slot group node. Useful to dynamically change the sizing of time nodes.
     * ```js
     * (group: Date[]) => { style?: Object }
     * ```
     */
    slotGroupPropGetter: PropTypes.func,

    /**
     * Optionally provide a function that returns an object of className or style props
     * to be applied to the the day background. Caution! Styles that change layout or
     * position may break the calendar in unexpected ways.
     *
     * ```js
     * (date: Date) => { className?: string, style?: Object }
     * ```
     */
    dayPropGetter: PropTypes.func,

    /**
     * Support to show multi-day events with specific start and end times in the
     * main time grid (rather than in the all day header).
     *
     * **Note: This may cause calendars with several events to look very busy in
     * the week and day views.**
     */
    showMultiDayTimes: PropTypes.bool,

    /**
     * Determines a maximum amount of rows of events to display in the all day
     * section for Week and Day views, will display `showMore` button if
     * events excede this number.
     *
     * Defaults to `Infinity`
     */
    allDayMaxRows: PropTypes.number,

    /**
     * Constrains the minimum _time_ of the Day and Week views.
     */
    min: PropTypes.instanceOf(Date),

    /**
     * Constrains the maximum _time_ of the Day and Week views.
     */
    max: PropTypes.instanceOf(Date),

    /**
     * Determines how far down the scroll pane is initially scrolled down.
     */
    scrollToTime: PropTypes.instanceOf(Date),

    /**
     * Determines whether the scroll pane is automatically scrolled down or not.
     */
    enableAutoScroll: PropTypes.bool,

    /**
     * Determines the layout of resource groups in the calendar.
     * When `true`, resources will be grouped by date in the week view.
     * When `false`, resources will be grouped by week.
     */
    resourceGroupingLayout: PropTypes.bool,

    /**
     * Specify a specific culture code for the Calendar.
     *
     * **Note: it's generally better to handle this globally via your i18n library.**
     */
    culture: PropTypes.string,

    /**
     * Localizer specific formats, tell the Calendar how to format and display dates.
     *
     * `format` types are dependent on the configured localizer; Moment, Luxon and Globalize
     * accept strings of tokens according to their own specification, such as: `'DD mm yyyy'`.
     *
     * ```jsx
     * let formats = {
     *   dateFormat: 'dd',
     *
     *   dayFormat: (date, , localizer) =>
     *     localizer.format(date, 'DDD', culture),
     *
     *   dayRangeHeaderFormat: ({ start, end }, culture, localizer) =>
     *     localizer.format(start, { date: 'short' }, culture) + ' – ' +
     *     localizer.format(end, { date: 'short' }, culture)
     * }
     *
     * <Calendar formats={formats} />
     * ```
     *
     * All localizers accept a function of
     * the form `(date: Date, culture: ?string, localizer: Localizer) -> string`
     */
    formats: PropTypes.shape({
      /**
       * Format for the day of the month heading in the Month view.
       * e.g. "01", "02", "03", etc
       */
      dateFormat,

      /**
       * A day of the week format for Week and Day headings,
       * e.g. "Wed 01/04"
       *
       */
      dayFormat: dateFormat,

      /**
       * Week day name format for the Month week day headings,
       * e.g: "Sun", "Mon", "Tue", etc
       *
       */
      weekdayFormat: dateFormat,

      /**
       * The timestamp cell formats in Week and Time views, e.g. "4:00 AM"
       */
      timeGutterFormat: dateFormat,

      /**
       * Toolbar header format for the Month view, e.g "2015 April"
       *
       */
      monthHeaderFormat: dateFormat,

      /**
       * Toolbar header format for the Week views, e.g. "Mar 29 - Apr 04"
       */
      dayRangeHeaderFormat: dateRangeFormat,

      /**
       * Toolbar header format for the Day view, e.g. "Wednesday Apr 01"
       */
      dayHeaderFormat: dateFormat,

      /**
       * Toolbar header format for the Agenda view, e.g. "4/1/2015 – 5/1/2015"
       */
      agendaHeaderFormat: dateRangeFormat,

      /**
       * A time range format for selecting time slots, e.g "8:00am – 2:00pm"
       */
      selectRangeFormat: dateRangeFormat,

      agendaDateFormat: dateFormat,
      agendaTimeFormat: dateFormat,
      agendaTimeRangeFormat: dateRangeFormat,

      /**
       * Time range displayed on events.
       */
      eventTimeRangeFormat: dateRangeFormat,

      /**
       * An optional event time range for events that continue onto another day
       */
      eventTimeRangeStartFormat: dateFormat,

      /**
       * An optional event time range for events that continue from another day
       */
      eventTimeRangeEndFormat: dateFormat,
    }),

    /**
     * Customize how different sections of the calendar render by providing custom Components.
     * In particular the `Event` component can be specified for the entire calendar, or you can
     * provide an individual component for each view type.
     *
     * ```jsx
     * let components = {
     *   event: MyEvent, // used by each view (Month, Day, Week)
     *   eventWrapper: MyEventWrapper,
     *   eventContainerWrapper: MyEventContainerWrapper,
     *   dateCellWrapper: MyDateCellWrapper,
     *   timeSlotWrapper: MyTimeSlotWrapper,
     *   timeGutterHeader: MyTimeGutterWrapper,
     *   timeGutterWrapper: MyTimeGutterWrapper,
     *   timeIndicatorWrapper: MyTimeIndicatorWrapper,
     *   resourceHeader: MyResourceHeader,
     *   showMore: MyShowMoreEvent,
     *   toolbar: MyToolbar,
     *   agenda: {
     *   	 event: MyAgendaEvent, // with the agenda view use a different component to render events
     *     time: MyAgendaTime,
     *     date: MyAgendaDate,
     *   },
     *   day: {
     *     header: MyDayHeader,
     *     event: MyDayEvent,
     *   },
     *   week: {
     *     header: MyWeekHeader,
     *     event: MyWeekEvent,
     *   },
     *   month: {
     *     header: MyMonthHeader,
     *     dateHeader: MyMonthDateHeader,
     *     event: MyMonthEvent,
     *   }
     * }
     * <Calendar components={components} />
     * ```
     */
    components: PropTypes.shape({
      event: PropTypes.elementType,
      eventWrapper: PropTypes.elementType,
      eventContainerWrapper: PropTypes.elementType,
      dateCellWrapper: PropTypes.elementType,
      dayColumnWrapper: PropTypes.elementType,
      timeSlotWrapper: PropTypes.elementType,
      timeGutterHeader: PropTypes.elementType,
      timeGutterWrapper: PropTypes.elementType,
      timeIndicatorWrapper: PropTypes.elementType,
      resourceHeader: PropTypes.elementType,
      showMore: PropTypes.elementType,

      toolbar: PropTypes.elementType,

      agenda: PropTypes.shape({
        date: PropTypes.elementType,
        time: PropTypes.elementType,
        event: PropTypes.elementType,
      }),

      day: PropTypes.shape({
        header: PropTypes.elementType,
        event: PropTypes.elementType,
      }),
      week: PropTypes.shape({
        header: PropTypes.elementType,
        event: PropTypes.elementType,
      }),
      month: PropTypes.shape({
        header: PropTypes.elementType,
        dateHeader: PropTypes.elementType,
        event: PropTypes.elementType,
      }),
    }),

    /**
     * String messages used throughout the component, override to provide localizations
     *
     * ```jsx
     * const messages = {
     *   date: 'Date',
     *   time: 'Time',
     *   event: 'Event',
     *   allDay: 'All Day',
     *   week: 'Week',
     *   work_week: 'Work Week',
     *   day: 'Day',
     *   month: 'Month',
     *   previous: 'Back',
     *   next: 'Next',
     *   yesterday: 'Yesterday',
     *   tomorrow: 'Tomorrow',
     *   today: 'Today',
     *   agenda: 'Agenda',
     *
     *   noEventsInRange: 'There are no events in this range.',
     *
     *   showMore: total => `+ ${total} more`,
     * }
     *
     * <Calendar messages={messages} />
     * ```
     */

    messages: PropTypes.shape({
      allDay: PropTypes.node,
      previous: PropTypes.node,
      next: PropTypes.node,
      today: PropTypes.node,
      month: PropTypes.node,
      week: PropTypes.node,
      day: PropTypes.node,
      agenda: PropTypes.node,
      date: PropTypes.node,
      time: PropTypes.node,
      event: PropTypes.node,
      noEventsInRange: PropTypes.node,
      showMore: PropTypes.func,
    }),

    /**
     * A day event layout(arrangement) algorithm.
     *
     * `overlap` allows events to be overlapped.
     *
     * `no-overlap` resizes events to avoid overlap.
     *
     * or custom `Function(events, minimumStartDifference, slotMetrics, accessors)`
     */
    dayLayoutAlgorithm: DayLayoutAlgorithmPropType,
  }

  static defaultProps = {
    events: [],
    backgroundEvents: [],
    elementProps: {},
    popup: false,
    toolbar: true,
    view: views.MONTH,
    views: [views.MONTH, views.WEEK, views.DAY, views.AGENDA],
    step: 30,
    length: 30,
    allDayMaxRows: Infinity,

    doShowMoreDrillDown: true,
    drilldownView: views.DAY,

    titleAccessor: 'title',
    tooltipAccessor: 'title',
    allDayAccessor: 'allDay',
    startAccessor: 'start',
    endAccessor: 'end',
    resourceAccessor: 'resourceId',

    resourceIdAccessor: 'id',
    resourceTitleAccessor: 'title',

    eventIdAccessor: 'id',

    longPressThreshold: 250,
    getNow: () => new Date(),
    dayLayoutAlgorithm: 'overlap',
  }

  constructor(...args) {
    super(...args)

    this.state = {
      context: Calendar.getContext(this.props),
    }
  }
  static getDerivedStateFromProps(nextProps) {
    return { context: Calendar.getContext(nextProps) }
  }

  static getContext({
    startAccessor,
    endAccessor,
    allDayAccessor,
    tooltipAccessor,
    titleAccessor,
    resourceAccessor,
    resourceIdAccessor,
    resourceTitleAccessor,
    eventIdAccessor,
    eventPropGetter,
    backgroundEventPropGetter,
    slotPropGetter,
    slotGroupPropGetter,
    dayPropGetter,
    view,
    views,
    localizer,
    culture,
    messages = {},
    components = {},
    formats = {},
  }) {
    let names = viewNames(views)
    const msgs = message(messages)
    return {
      viewNames: names,
      localizer: mergeWithDefaults(localizer, culture, formats, msgs),
      getters: {
        eventProp: (...args) =>
          (eventPropGetter && eventPropGetter(...args)) || {},
        backgroundEventProp: (...args) =>
          (backgroundEventPropGetter && backgroundEventPropGetter(...args)) ||
          {},
        slotProp: (...args) =>
          (slotPropGetter && slotPropGetter(...args)) || {},
        slotGroupProp: (...args) =>
          (slotGroupPropGetter && slotGroupPropGetter(...args)) || {},
        dayProp: (...args) => (dayPropGetter && dayPropGetter(...args)) || {},
      },
      components: defaults(components[view] || {}, omit(components, names), {
        eventWrapper: NoopWrapper,
        backgroundEventWrapper: NoopWrapper,
        eventContainerWrapper: NoopWrapper,
        dateCellWrapper: NoopWrapper,
        weekWrapper: NoopWrapper,
        timeSlotWrapper: NoopWrapper,
        timeGutterWrapper: NoopWrapper,
        timeIndicatorWrapper: NoopWrapper,
      }),
      accessors: {
        start: wrapAccessor(startAccessor),
        end: wrapAccessor(endAccessor),
        allDay: wrapAccessor(allDayAccessor),
        tooltip: wrapAccessor(tooltipAccessor),
        title: wrapAccessor(titleAccessor),
        resource: wrapAccessor(resourceAccessor),
        resourceId: wrapAccessor(resourceIdAccessor),
        resourceTitle: wrapAccessor(resourceTitleAccessor),
        eventId: wrapAccessor(eventIdAccessor),
      },
    }
  }

  getViews = () => {
    const views = this.props.views

    if (Array.isArray(views)) {
      return transform(views, (obj, name) => (obj[name] = VIEWS[name]), {})
    }

    if (typeof views === 'object') {
      return mapValues(views, (value, key) => {
        if (value === true) {
          return VIEWS[key]
        }

        return value
      })
    }

    return VIEWS
  }

  getView = () => {
    const views = this.getViews()

    return views[this.props.view]
  }

  getDrilldownView = (date) => {
    const { view, drilldownView, getDrilldownView } = this.props

    if (!getDrilldownView) return drilldownView

    return getDrilldownView(date, view, Object.keys(this.getViews()))
  }

  render() {
    let {
      view,
      toolbar,
      events,
      backgroundEvents,
      resourceGroupingLayout,
      style,
      className,
      elementProps,
      date: current,
      getNow,
      length,
      showMultiDayTimes,
      onShowMore,
      doShowMoreDrillDown,
      components: _0,
      formats: _1,
      messages: _2,
      culture: _3,
      ...props
    } = this.props

    current = current || getNow()

    let View = this.getView()
    const { accessors, components, getters, localizer, viewNames } =
      this.state.context

    let CalToolbar = components.toolbar || Toolbar
    const label = View.title(current, { localizer, length })

    return (
      <div
        {...elementProps}
        className={clsx(className, 'rbc-calendar', props.rtl && 'rbc-rtl')}
        style={style}
      >
        {toolbar && (
          <CalToolbar
            date={current}
            view={view}
            views={viewNames}
            label={label}
            onView={this.handleViewChange}
            onNavigate={this.handleNavigate}
            localizer={localizer}
          />
        )}
        <View
          {...props}
          events={events}
          backgroundEvents={backgroundEvents}
          date={current}
          getNow={getNow}
          length={length}
          localizer={localizer}
          getters={getters}
          components={components}
          accessors={accessors}
          showMultiDayTimes={showMultiDayTimes}
          getDrilldownView={this.getDrilldownView}
          onNavigate={this.handleNavigate}
          onDrillDown={this.handleDrillDown}
          onSelectEvent={this.handleSelectEvent}
          onDoubleClickEvent={this.handleDoubleClickEvent}
          onKeyPressEvent={this.handleKeyPressEvent}
          onSelectSlot={this.handleSelectSlot}
          onShowMore={onShowMore}
          doShowMoreDrillDown={doShowMoreDrillDown}
          resourceGroupingLayout={resourceGroupingLayout}
        />
        <IsolatedOverlayManager selected={this.props.selected} />
      </div>
    )
  }

  /**
   *
   * @param date
   * @param viewComponent
   * @param {'month'|'week'|'work_week'|'day'|'agenda'} [view] - optional
   * parameter. It appears when range change on view changing. It could be handy
   * when you need to have both: range and view type at once, i.e. for manage rbc
   * state via url
   */
  handleRangeChange = (date, viewComponent, view) => {
    let { onRangeChange, localizer } = this.props

    if (onRangeChange) {
      if (viewComponent.range) {
        onRangeChange(viewComponent.range(date, { localizer }), view)
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.error('onRangeChange prop not supported for this view')
        }
      }
    }
  }

  handleNavigate = (action, newDate) => {
    let { view, date, getNow, onNavigate, ...props } = this.props
    let ViewComponent = this.getView()
    let today = getNow()

    date = moveDate(ViewComponent, {
      ...props,
      action,
      date: newDate || date || today,
      today,
    })

    onNavigate(date, view, action)
    this.handleRangeChange(date, ViewComponent)
  }

  handleViewChange = (view) => {
    if (view !== this.props.view && isValidView(view, this.props)) {
      this.props.onView(view)
    }

    let views = this.getViews()
    this.handleRangeChange(
      this.props.date || this.props.getNow(),
      views[view],
      view
    )
  }

  handleSelectEvent = (...args) => {
    notify(this.props.onSelectEvent, args)
  }

  handleDoubleClickEvent = (...args) => {
    notify(this.props.onDoubleClickEvent, args)
  }

  handleKeyPressEvent = (...args) => {
    notify(this.props.onKeyPressEvent, args)
  }

  handleSelectSlot = (slotInfo) => {
    notify(this.props.onSelectSlot, slotInfo)
  }

  handleDrillDown = (date, view) => {
    const { onDrillDown } = this.props
    if (onDrillDown) {
      onDrillDown(date, view, this.drilldownView)
      return
    }
    if (view) this.handleViewChange(view)

    this.handleNavigate(navigate.DATE, date)
  }
}

export default uncontrollable(Calendar, {
  view: 'onView',
  date: 'onNavigate',
  selected: 'onSelectEvent',
})
