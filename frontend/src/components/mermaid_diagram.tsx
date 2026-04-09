import type { CSSProperties } from 'react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import mermaid from 'mermaid'

let isMermaidInitialized: boolean = false

/** Base diagram text size; SVG scales with preview width (useMaxWidth), so labels stay proportional to the diagram. */
const MERMAID_FONT_SIZE_PX: number = 14
const MERMAID_THEME_FONT_SIZE: string = `${MERMAID_FONT_SIZE_PX}px`
/** 1 = diagram fits column via SVG max-width; Ctrl/Cmd+wheel still adjusts. */
const MERMAID_DEFAULT_ZOOM: number = 1

const SCALE_MIN: number = 0.25
const SCALE_MAX: number = 4
const SCALE_STEP: number = 0.15

function clampScale(value: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value))
}

function ensureMermaidInitialized(): void {
  if (isMermaidInitialized) {
    return
  }
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    fontSize: MERMAID_FONT_SIZE_PX,
    themeVariables: {
      fontSize: MERMAID_THEME_FONT_SIZE,
    },
    flowchart: {
      useMaxWidth: true,
    },
    sequence: {
      useMaxWidth: true,
      messageFontSize: MERMAID_FONT_SIZE_PX,
      noteFontSize: MERMAID_FONT_SIZE_PX - 2,
      actorFontSize: MERMAID_FONT_SIZE_PX - 2,
    },
    class: {
      useMaxWidth: true,
    },
    state: {
      useMaxWidth: true,
    },
    er: {
      useMaxWidth: true,
    },
  })
  isMermaidInitialized = true
}

function clearContainer(container: HTMLElement): void {
  container.replaceChildren()
}

function mountSvgMarkup(container: HTMLElement, svgMarkup: string): void {
  const parsed: Document = new DOMParser().parseFromString(
    svgMarkup,
    'image/svg+xml',
  )
  if (parsed.querySelector('parsererror')) {
    container.replaceChildren()
    container.textContent = 'Mermaid: invalid SVG output'
    return
  }
  const root: Element = parsed.documentElement
  if (root.tagName.toLowerCase() !== 'svg') {
    container.replaceChildren()
    container.textContent = 'Mermaid: invalid SVG output'
    return
  }
  container.replaceChildren(document.importNode(root, true))
}

export interface MermaidDiagramProps {
  chart: string
}

export function MermaidDiagram(props: MermaidDiagramProps) {
  const { chart } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRootRef = useRef<HTMLDivElement>(null)
  const reactId: string = useId().replace(/:/g, '')
  const sequenceRef = useRef(0)
  const [scale, setScale] = useState<number>(MERMAID_DEFAULT_ZOOM)
  useLayoutEffect(() => {
    ensureMermaidInitialized()
    const el: HTMLDivElement | null = containerRef.current
    if (!el) {
      return
    }
    let cancelled: boolean = false
    const renderId: string = `mmd-${reactId}-${++sequenceRef.current}`
    clearContainer(el)
    void (async () => {
      try {
        const result = await mermaid.render(renderId, chart, el)
        if (cancelled || !el.isConnected) {
          return
        }
        const { svg, bindFunctions } = result
        mountSvgMarkup(el, svg)
        bindFunctions?.(el)
      } catch (err) {
        if (!cancelled && el.isConnected) {
          clearContainer(el)
          const msg: string = err instanceof Error ? err.message : String(err)
          el.textContent = `Mermaid: ${msg}`
        }
      }
    })()
    return () => {
      cancelled = true
      clearContainer(el)
    }
  }, [chart, reactId])
  useEffect(() => {
    const root: HTMLDivElement | null = zoomRootRef.current
    if (!root) {
      return
    }
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
      e.preventDefault()
      const delta: number = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP
      setScale((previous: number) => clampScale(previous + delta))
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      root.removeEventListener('wheel', onWheel)
    }
  }, [])
  const rootStyle: CSSProperties & { zoom: number } = {
    zoom: scale,
  }
  return (
    <div
      ref={zoomRootRef}
      className="mermaid-zoom-root"
      style={rootStyle}
      tabIndex={0}
      aria-label="Mermaid diagram; hold Ctrl or Command and scroll the mouse wheel to zoom"
    >
      <div className="mermaid-zoom-viewport">
        <div className="mermaid-zoom-inner">
          <div className="mermaid" ref={containerRef} />
        </div>
      </div>
    </div>
  )
}
