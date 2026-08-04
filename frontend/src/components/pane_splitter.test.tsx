import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaneSplitter } from './pane_splitter'
import { DEFAULT_SOURCE_RATIO, MAX_SOURCE_RATIO } from '../split_ratio'

const CONTAINER_LEFT: number = 0
const CONTAINER_WIDTH: number = 1000

function Harness(props: { initialRatio?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState<number>(
    props.initialRatio ?? DEFAULT_SOURCE_RATIO,
  )
  return (
    <div ref={containerRef}>
      <span data-testid="ratio">{ratio.toFixed(3)}</span>
      <PaneSplitter
        ratio={ratio}
        onRatioChange={setRatio}
        onResetRatio={() => {
          setRatio(DEFAULT_SOURCE_RATIO)
        }}
        containerRef={containerRef}
      />
    </div>
  )
}

function renderHarness(initialRatio?: number): HTMLElement {
  render(<Harness initialRatio={initialRatio} />)
  const separator: HTMLElement = screen.getByRole('separator')
  const container: HTMLElement = separator.parentElement as HTMLElement
  container.getBoundingClientRect = () =>
    ({ left: CONTAINER_LEFT, width: CONTAINER_WIDTH }) as DOMRect
  separator.setPointerCapture = () => undefined
  separator.releasePointerCapture = () => undefined
  separator.hasPointerCapture = () => true
  return separator
}

function readRatio(): number {
  return Number.parseFloat(screen.getByTestId('ratio').textContent ?? '')
}

/** jsdom has no `PointerEvent`, so drive React's pointer handlers with a mouse event. */
function firePointerEvent(
  target: HTMLElement,
  type: string,
  clientX: number,
): void {
  const event: MouseEvent = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
  })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  fireEvent(target, event)
}

afterEach(() => {
  cleanup()
})

describe('PaneSplitter', () => {
  it('resizes to the pointer position while dragging', () => {
    const separator: HTMLElement = renderHarness()
    firePointerEvent(separator, 'pointerdown', 500)
    firePointerEvent(separator, 'pointermove', 700)
    expect(readRatio()).toBeCloseTo(0.7, 3)
    firePointerEvent(separator, 'pointerup', 700)
    firePointerEvent(separator, 'pointermove', 200)
    expect(readRatio()).toBeCloseTo(0.7, 3)
  })

  it('clamps the ratio so both panes stay visible', () => {
    const separator: HTMLElement = renderHarness()
    firePointerEvent(separator, 'pointerdown', 500)
    firePointerEvent(separator, 'pointermove', 5000)
    expect(readRatio()).toBeCloseTo(MAX_SOURCE_RATIO, 3)
  })

  it('adjusts the ratio with arrow keys and resets on double click', () => {
    const separator: HTMLElement = renderHarness()
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(readRatio()).toBeCloseTo(DEFAULT_SOURCE_RATIO + 0.02, 3)
    fireEvent.keyDown(separator, { key: 'ArrowLeft', shiftKey: true })
    expect(readRatio()).toBeCloseTo(DEFAULT_SOURCE_RATIO - 0.08, 3)
    fireEvent.doubleClick(separator)
    expect(readRatio()).toBeCloseTo(DEFAULT_SOURCE_RATIO, 3)
  })

  it('exposes the current ratio to assistive technology', () => {
    renderHarness(0.42)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '42')
  })
})
