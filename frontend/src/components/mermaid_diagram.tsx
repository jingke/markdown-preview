import { useId, useLayoutEffect, useRef } from 'react'
import mermaid from 'mermaid'

let isMermaidInitialized: boolean = false

function ensureMermaidInitialized(): void {
  if (isMermaidInitialized) {
    return
  }
  mermaid.initialize({ startOnLoad: false, theme: 'default' })
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
  const reactId: string = useId().replace(/:/g, '')
  const sequenceRef = useRef(0)
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
  return <div className="mermaid" ref={containerRef} />
}
