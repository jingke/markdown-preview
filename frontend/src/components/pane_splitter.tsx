import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { clampSourceRatio } from '../split_ratio'

const KEYBOARD_STEP: number = 0.02
const KEYBOARD_STEP_LARGE: number = 0.1
const DRAGGING_CLASS: string = 'app-split--dragging'

export interface PaneSplitterProps {
  ratio: number
  onRatioChange: (nextRatio: number) => void
  onResetRatio: () => void
  containerRef: RefObject<HTMLElement | null>
  ariaControls?: string
}

/** Drag handle that resizes the two panes of `containerRef` along the inline axis. */
export function PaneSplitter(props: PaneSplitterProps) {
  const { ratio, onRatioChange, onResetRatio, containerRef, ariaControls } =
    props
  const [isDragging, setIsDragging] = useState<boolean>(false)

  useEffect(() => {
    const container: HTMLElement | null = containerRef.current
    if (!container || !isDragging) {
      return
    }
    container.classList.add(DRAGGING_CLASS)
    return () => {
      container.classList.remove(DRAGGING_CLASS)
    }
  }, [containerRef, isDragging])

  const ratioFromClientX = useCallback(
    (clientX: number): number | null => {
      const container: HTMLElement | null = containerRef.current
      if (!container) {
        return null
      }
      const bounds: DOMRect = container.getBoundingClientRect()
      if (bounds.width <= 0) {
        return null
      }
      return clampSourceRatio((clientX - bounds.left) / bounds.width)
    },
    [containerRef],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsDragging(true)
    },
    [],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!isDragging) {
        return
      }
      const nextRatio: number | null = ratioFromClientX(event.clientX)
      if (nextRatio === null) {
        return
      }
      onRatioChange(nextRatio)
    },
    [isDragging, onRatioChange, ratioFromClientX],
  )

  const stopDragging = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setIsDragging(false)
    },
    [],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      const step: number = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onRatioChange(clampSourceRatio(ratio - step))
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onRatioChange(clampSourceRatio(ratio + step))
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        onRatioChange(clampSourceRatio(event.key === 'Home' ? 0 : 1))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        onResetRatio()
      }
    },
    [onRatioChange, onResetRatio, ratio],
  )

  return (
    <div
      role="separator"
      className={`app-splitter ${isDragging ? 'app-splitter--dragging' : ''}`}
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize Markdown source and preview panes"
      aria-controls={ariaControls}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      title="Drag to resize; double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onDoubleClick={onResetRatio}
      onKeyDown={onKeyDown}
    />
  )
}
