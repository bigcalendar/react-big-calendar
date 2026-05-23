import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Overlay } from 'react-overlays'
import Popup from './Popup'

/**
 * Manages calendar overlays/popups independently from the main component tree
 * to prevent unnecessary re-renders of the Month view
 */
const IsolatedOverlayManager = ({ selected }) => {
  const [overlay, setOverlay] = useState(null)
  const [portalContainer, setPortalContainer] = useState(null)
  const overlayRef = useRef(null)
  const popupRef = useRef(null)

  useEffect(() => {
    const container = document.createElement('div')
    container.id = 'calendar-overlay-portal'
    document.body.appendChild(container)
    setPortalContainer(container)

    window.hideCalendarOverlay = () => {
      setOverlay(null)
    }

    return () => {
      document.body.removeChild(container)
      delete window.showCalendarOverlay
      delete window.hideCalendarOverlay
    }
  }, [])

  useEffect(() => {
    window.showCalendarOverlay = (overlayData) => {
      setOverlay({ ...overlayData, selected: selected || overlayData.selected })
    }
  }, [selected])

  const handleHide = () => setOverlay(null)

  useEffect(() => {
    if (overlay && selected !== overlay.selected) {
      setOverlay(prev => ({ ...prev, selected }))
    }
  }, [selected, overlay])

  if (!overlay || !portalContainer) return null

  return createPortal(
    <Overlay
      rootClose
      flip
      show
      placement="bottom"
      onHide={handleHide}
      target={overlay.target}
    >
      {({ props }) => (
        <Popup
          {...props}
          containerRef={overlay.containerRef || overlayRef}
          ref={popupRef}
          target={overlay.target}
          offset={overlay.popupOffset || { x: 5, y: 5 }}
          accessors={overlay.accessors}
          getters={overlay.getters}
          selected={overlay.selected}
          components={overlay.components}
          localizer={overlay.localizer}
          position={overlay.position}
          show={handleHide}
          events={overlay.events}
          slotStart={overlay.date}
          slotEnd={overlay.end}
          onSelect={overlay.onSelect}
          onDoubleClick={overlay.onDoubleClick}
          onKeyPress={overlay.onKeyPress}
          handleDragStart={overlay.handleDragStart}
        />
      )}
    </Overlay>,
    portalContainer
  )
}

export default IsolatedOverlayManager