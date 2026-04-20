import type { CSSProperties } from 'react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import mermaid from 'mermaid'
import type { MermaidFenceReplaceArgs } from './markdown_preview'

let isMermaidInitialized: boolean = false

/** Base diagram text size; SVG scales with preview width (useMaxWidth), so labels stay proportional to the diagram. */
const MERMAID_FONT_SIZE_PX: number = 14
const MERMAID_THEME_FONT_SIZE: string = `${MERMAID_FONT_SIZE_PX}px`
/** 1 = diagram fits column via SVG max-width; Ctrl/Cmd+wheel still adjusts. */
const MERMAID_DEFAULT_ZOOM: number = 1

const SCALE_MIN: number = 0.25
const SCALE_MAX: number = 4
const SCALE_STEP: number = 0.15

const MAX_AI_ATTEMPTS: number = 3

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

function mountSvgMarkup(container: HTMLElement, svgMarkup: string): boolean {
  const parsed: Document = new DOMParser().parseFromString(
    svgMarkup,
    'image/svg+xml',
  )
  if (parsed.querySelector('parsererror')) {
    container.replaceChildren()
    return false
  }
  const root: Element = parsed.documentElement
  if (root.tagName.toLowerCase() !== 'svg') {
    container.replaceChildren()
    return false
  }
  container.replaceChildren(document.importNode(root, true))
  return true
}

async function verifyMermaidRenders(
  renderId: string,
  chartText: string,
): Promise<void> {
  const el: HTMLDivElement = document.createElement('div')
  await mermaid.render(renderId, chartText, el)
}

export interface MermaidDiagramProps {
  chart: string
  sourceRange?: { start: number; end: number } | null
  expectedFence?: string
  onFenceReplaced?: (args: MermaidFenceReplaceArgs) => void
  groqApiKey?: string
  groqModel?: string
}

function WarningIcon() {
  return (
    <svg
      className="mermaid-error-strip__icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.518 11.581c.75 1.334-.213 2.98-1.742 2.98H3.481c-1.53 0-2.493-1.646-1.743-2.98l6.52-11.581zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 0-.993.883L9 7v4a1 1 0 0 0 1.993.117L11 11V7a1 1 0 0 0-1-1z"
        fill="currentColor"
      />
    </svg>
  )
}

export function MermaidDiagram(props: MermaidDiagramProps) {
  const { chart, sourceRange, expectedFence, onFenceReplaced, groqApiKey, groqModel } =
    props
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRootRef = useRef<HTMLDivElement>(null)
  const reactId: string = useId().replace(/:/g, '')
  const sequenceRef = useRef(0)
  const busyAiRef = useRef<boolean>(false)
  const [scale, setScale] = useState<number>(MERMAID_DEFAULT_ZOOM)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [aiFetchError, setAiFetchError] = useState<string | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false)
  const [attemptLabel, setAttemptLabel] = useState<string | null>(null)
  const [loopExhausted, setLoopExhausted] = useState<boolean>(false)

  useLayoutEffect(() => {
    ensureMermaidInitialized()
    const el: HTMLDivElement | null = containerRef.current
    if (!el) {
      return
    }
    let cancelled: boolean = false
    const renderId: string = `mmd-${reactId}-${++sequenceRef.current}`
    setRenderError(null)
    setAiFetchError(null)
    setConfigError(null)
    setLoopExhausted(false)
    clearContainer(el)
    void (async () => {
      try {
        const result = await mermaid.render(renderId, chart, el)
        if (cancelled || !el.isConnected) {
          return
        }
        const { svg, bindFunctions } = result
        const ok: boolean = mountSvgMarkup(el, svg)
        if (!ok) {
          if (!cancelled && el.isConnected) {
            clearContainer(el)
            setRenderError('invalid SVG output')
          }
          return
        }
        bindFunctions?.(el)
      } catch (err) {
        if (!cancelled && el.isConnected) {
          clearContainer(el)
          const msg: string = err instanceof Error ? err.message : String(err)
          setRenderError(msg)
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

  const canUseAi: boolean =
    renderError !== null &&
    sourceRange != null &&
    expectedFence !== undefined &&
    onFenceReplaced !== undefined

  const onFixWithAi = useCallback(async (): Promise<void> => {
    if (!canUseAi || busyAiRef.current || !onFenceReplaced || !sourceRange) {
      return
    }
    busyAiRef.current = true
    setIsAiLoading(true)
    setAiFetchError(null)
    setConfigError(null)
    setLoopExhausted(false)
    let errorMsg: string = renderError
      ? `Mermaid: ${renderError}`
      : 'Mermaid: unknown error'
    let chartCandidate: string = chart
    try {
      for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
        setAttemptLabel(`Attempt ${attempt + 1} / ${MAX_AI_ATTEMPTS}`)
        const aiBody: Record<string, string | number> = {
          chart: chartCandidate,
          error_message: errorMsg,
          attempt_index: attempt,
        }
        const trimmedKey: string = (groqApiKey ?? '').trim()
        if (trimmedKey !== '') {
          aiBody.groq_api_key = trimmedKey
        }
        const trimmedModel: string = (groqModel ?? '').trim()
        if (trimmedModel !== '') {
          aiBody.groq_model = trimmedModel
        }
        const response: Response = await fetch('/api/mermaid/ai-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(aiBody),
        })
        if (response.status === 503) {
          const data: unknown = await response.json().catch(() => ({}))
          const detail: string =
            typeof data === 'object' &&
            data !== null &&
            'detail' in data &&
            typeof (data as { detail: unknown }).detail === 'string'
              ? (data as { detail: string }).detail
              : 'AI fix is not configured on the server.'
          setConfigError(detail)
          return
        }
        if (!response.ok) {
          const text: string = await response.text()
          setAiFetchError(text.slice(0, 200) || `HTTP ${response.status}`)
          return
        }
        const parsed: unknown = await response.json()
        const fixed: string | undefined =
          parsed &&
          typeof parsed === 'object' &&
          'fixed_chart' in parsed &&
          typeof (parsed as { fixed_chart: unknown }).fixed_chart === 'string'
            ? (parsed as { fixed_chart: string }).fixed_chart
            : undefined
        if (fixed === undefined) {
          setAiFetchError('Unexpected response from server')
          return
        }
        const verifyId: string = `mmd-verify-${reactId}-${attempt}-${Date.now()}`
        try {
          await verifyMermaidRenders(verifyId, fixed)
          if (expectedFence === undefined || sourceRange == null) {
            return
          }
          onFenceReplaced({
            sourceRange,
            expectedFence,
            newInnerDiagram: fixed,
          })
          setAttemptLabel(null)
          return
        } catch (verifyErr) {
          const msg: string =
            verifyErr instanceof Error ? verifyErr.message : String(verifyErr)
          errorMsg = msg
          chartCandidate = fixed
        }
      }
      setLoopExhausted(true)
    } catch (fetchErr) {
      const msg: string =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      setAiFetchError(msg)
    } finally {
      busyAiRef.current = false
      setIsAiLoading(false)
      setAttemptLabel(null)
    }
  }, [
    canUseAi,
    chart,
    expectedFence,
    onFenceReplaced,
    renderError,
    sourceRange,
    reactId,
    groqApiKey,
    groqModel,
  ])

  const rootStyle: CSSProperties & { zoom: number } = {
    zoom: scale,
  }

  const summaryLine: string = renderError
    ? `Mermaid: ${renderError}`.length > 120
      ? `Mermaid: ${renderError}`.slice(0, 117) + '…'
      : `Mermaid: ${renderError}`
    : ''

  const showErrorChrome: boolean = renderError !== null

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
          {showErrorChrome ? (
            <div
              className="mermaid-error-strip"
              role="alert"
              aria-live="polite"
              aria-busy={isAiLoading}
            >
              <div className="mermaid-error-strip__header">
                <WarningIcon />
                <span className="mermaid-error-strip__title">
                  Couldn&apos;t render diagram
                </span>
              </div>
              <p
                className="mermaid-error-strip__message"
                title={`Mermaid: ${renderError}`}
              >
                {summaryLine}
              </p>
              {canUseAi ? (
                <div className="mermaid-error-strip__actions">
                  <button
                    type="button"
                    className="file-button mermaid-ai-fix-button"
                    disabled={isAiLoading}
                    onClick={() => {
                      void onFixWithAi()
                    }}
                  >
                    {isAiLoading ? 'Fixing…' : 'Fix with AI'}
                  </button>
                  {attemptLabel ? (
                    <span className="mermaid-error-strip__attempt">
                      {attemptLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {configError ? (
                <p className="mermaid-error-strip__config">{configError}</p>
              ) : null}
              {aiFetchError ? (
                <p className="mermaid-error-strip__fetch">{aiFetchError}</p>
              ) : null}
              {loopExhausted ? (
                <p className="mermaid-error-strip__fetch">
                  Could not fix automatically after {MAX_AI_ATTEMPTS} attempts.
                </p>
              ) : null}
            </div>
          ) : null}
          <div
            className={
              showErrorChrome
                ? 'mermaid mermaid--render-hidden'
                : 'mermaid'
            }
            ref={containerRef}
            aria-hidden={showErrorChrome}
          />
        </div>
      </div>
    </div>
  )
}
