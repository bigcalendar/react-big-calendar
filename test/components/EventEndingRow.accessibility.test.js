import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import EventEndingRow from '../../src/EventEndingRow'
import { getSlotMetrics } from '../../src/utils/DateSlotMetrics'
import {
  accessors,
  getters,
  localizer,
  mergedLocalizer,
  components,
  makeEvent,
} from './fixtures'

const range = [
  new Date(2023, 0, 8),
  new Date(2023, 0, 9),
  new Date(2023, 0, 10),
  new Date(2023, 0, 11),
  new Date(2023, 0, 12),
  new Date(2023, 0, 13),
  new Date(2023, 0, 14),
]

function rowProps(events, overrides = {}) {
  const slotMetrics = getSlotMetrics()({
    range,
    events,
    maxRows: 2,
    minRows: 0,
    accessors,
    localizer,
  })
  return {
    segments: slotMetrics.levels.flat().concat(slotMetrics.extra),
    slotMetrics,
    accessors,
    getters,
    localizer: mergedLocalizer,
    components,
    onShowMore: jest.fn(),
    ...overrides,
  }
}

function renderRow(props) {
  return render(
    <div role="table">
      <div role="rowgroup">
        <div role="row">
          <EventEndingRow {...props} />
        </div>
      </div>
    </div>
  )
}

function overlappingEvents() {
  return [
    makeEvent({
      id: 1,
      start: new Date(2023, 0, 9),
      end: new Date(2023, 0, 10),
    }),
    makeEvent({
      id: 2,
      start: new Date(2023, 0, 9),
      end: new Date(2023, 0, 12),
    }),
  ]
}

test('show-more buttons belong to cells, including hidden spanning events', () => {
  const props = rowProps(overlappingEvents())
  const { container } = renderRow(props)
  const cells = screen.getAllByRole('cell')

  expect(cells).toHaveLength(3)
  expect(
    cells.map((cell) => within(cell).getByRole('button').textContent)
  ).toEqual(['+2 more', '+1 more', '+1 more'])
  cells.forEach((cell) => {
    expect(cell).toHaveClass('rbc-row-segment')
    expect(parseFloat(cell.style.flexBasis)).toBeCloseTo(100 / 7)
    expect(within(cell).getByRole('button')).toHaveAttribute('type', 'button')
  })
  expect(container.querySelectorAll('.rbc-row-segment')).toHaveLength(4)

  const button = within(cells[1]).getByRole('button')
  fireEvent.click(button)
  expect(props.onShowMore).toHaveBeenCalledTimes(1)
  expect(props.onShowMore).toHaveBeenCalledWith(3, button)
})

test('custom show-more controls keep their props and native button semantics', () => {
  const onClick = jest.fn()
  const received = []
  const ShowMore = (props) => {
    received.push(props)
    return (
      <div role="cell">
        <button type="button" onClick={onClick}>
          Custom {props.count}
        </button>
      </div>
    )
  }
  const events = overlappingEvents()
  const props = rowProps(events, {
    components: { ...components, showMore: ShowMore },
  })
  renderRow(props)
  const cells = screen.getAllByRole('cell')

  expect(cells).toHaveLength(3)
  expect(
    cells.map((cell) => within(cell).getByRole('button').textContent)
  ).toEqual(['Custom 2', 'Custom 1', 'Custom 1'])
  cells.forEach((cell) => {
    expect(cell.parentElement).toHaveClass('rbc-row-segment')
    expect(cell.parentElement).not.toHaveAttribute('role')
  })
  expect(received).toEqual(
    [2, 3, 4].map((slot) => ({
      localizer: mergedLocalizer,
      slotDate: range[slot - 1],
      slot,
      count: slot === 2 ? 2 : 1,
      events: slot === 2 ? events : [events[1]],
      remainingEvents: slot === 2 ? events : [events[1]],
    }))
  )
  const button = within(cells[0]).getByRole('button')
  button.focus()
  expect(button).toHaveFocus()
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledTimes(1)
  expect(props.onShowMore).not.toHaveBeenCalled()
})

test('a non-overflowing event does not gain an empty show-more cell', () => {
  const event = makeEvent({
    start: new Date(2023, 0, 9),
    end: new Date(2023, 0, 10),
  })
  const { container } = renderRow(rowProps([event]))

  expect(screen.getByText(event.title)).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('cell')).not.toBeInTheDocument()
  expect(container.querySelectorAll('.rbc-row-segment')).toHaveLength(2)
})
