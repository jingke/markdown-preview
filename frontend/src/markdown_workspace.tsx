import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from 'react'
import { Link } from 'react-router-dom'
import { MarkdownPreview } from './components/markdown_preview'
import type { MermaidFenceReplaceArgs } from './components/markdown_preview'
import { buildMermaidFence } from './mermaid_fence'
import {
  buildSectionScrollMap,
  charIndexToTextareaScroll,
  extractHeadingCharOffsets,
  previewScrollToSourceChar,
  sourceCharToPreviewScroll,
  textareaScrollToCharIndex,
  type SectionScrollMap,
} from './scroll_sync'
import {
  buildDocumentLabelFromFileName,
  buildDrawIoDownloadFileName,
  buildDrawIoMarkdownDocument,
  triggerDrawIoDownload,
} from './export_draw_io'
import './App.css'

/** Lets programmatic scroll events flush before we stop ignoring the peer pane. */
function scheduleReleaseScrollIgnore(
  ignoreRef: MutableRefObject<boolean>,
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ignoreRef.current = false
    })
  })
}

const DEFAULT_MARKDOWN: string = `# Markdown + Mermaid

GFM table:

| Piece | Role |
| ----- | ---- |
| react-markdown | Parse MD |
| mermaid | Diagrams |

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[Preview]
  B --> C[Mermaid]
\`\`\`
`

const EMPTY_EXPORT_MESSAGE: string =
  'Nothing to export. Add Markdown content first.'

class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

async function uploadMarkdownFile(file: File): Promise<string> {
  const formData: FormData = new FormData()
  formData.append('file', file)
  const response: Response = await fetch('/api/preview/upload', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    const text: string = await response.text()
    let detail: string = text
    try {
      const parsed: unknown = JSON.parse(text) as { detail?: unknown }
      if (
        parsed &&
        typeof parsed === 'object' &&
        'detail' in parsed &&
        typeof (parsed as { detail: unknown }).detail === 'string'
      ) {
        detail = (parsed as { detail: string }).detail
      }
    } catch {
      /* use raw text */
    }
    throw new HttpError(
      detail || `${response.status} ${response.statusText}`,
      response.status,
    )
  }
  const data: { content: string } = (await response.json()) as { content: string }
  return data.content
}

function SourceVisibilitySwitch(props: {
  isOn: boolean
  onToggle: () => void
  ariaControls?: string
}) {
  const { isOn, onToggle, ariaControls } = props
  return (
    <button
      type="button"
      role="switch"
      className={`source-toggle ${isOn ? 'source-toggle--on' : 'source-toggle--off'}`}
      aria-checked={isOn}
      aria-label="Markdown source panel"
      aria-controls={ariaControls}
      onClick={onToggle}
    />
  )
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader: FileReader = new FileReader()
    reader.onload = (): void => {
      resolve(String(reader.result))
    }
    reader.onerror = (): void => {
      reject(new Error('Could not read file'))
    }
    reader.readAsText(file)
  })
}

export interface MarkdownWorkspaceProps {
  groqApiKey: string
  groqModel: string
}

export function MarkdownWorkspace(props: MarkdownWorkspaceProps) {
  const { groqApiKey, groqModel } = props
  const appRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const previewBodyRef = useRef<HTMLDivElement>(null)
  const sectionMapRef = useRef<SectionScrollMap | null>(null)
  const ignoreEditorScrollRef = useRef<boolean>(false)
  const ignorePreviewScrollRef = useRef<boolean>(false)
  const [markdown, setMarkdown] = useState<string>(DEFAULT_MARKDOWN)
  const previewMarkdown: string = useDeferredValue(markdown)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSourceVisible, setIsSourceVisible] = useState<boolean>(true)
  const [mermaidAiRevert, setMermaidAiRevert] = useState<{
    range: { start: number; end: number }
    previousSlice: string
    postFixSlice: string
  } | null>(null)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const toolbarEl: HTMLElement | null = toolbarRef.current
    const appEl: HTMLDivElement | null = appRef.current
    if (!toolbarEl || !appEl) {
      return
    }
    const toolbarGapPx: number = 10
    const syncToolbarInset = (): void => {
      const bottom: number = toolbarEl.getBoundingClientRect().bottom
      appEl.style.setProperty(
        '--app-toolbar-space',
        `${bottom + toolbarGapPx}px`,
      )
    }
    syncToolbarInset()
    const observer: ResizeObserver = new ResizeObserver(syncToolbarInset)
    observer.observe(toolbarEl)
    window.addEventListener('resize', syncToolbarInset)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncToolbarInset)
    }
  }, [error])

  useEffect(() => {
    if (markdown.trim() !== '' && error === EMPTY_EXPORT_MESSAGE) {
      setError(null)
    }
  }, [markdown, error])

  useEffect(() => {
    if (!isExportMenuOpen) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      const root: HTMLDivElement | null = exportMenuRef.current
      if (
        !root ||
        !(event.target instanceof Node) ||
        root.contains(event.target)
      ) {
        return
      }
      setIsExportMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isExportMenuOpen])

  const rebuildSectionMap = useCallback((): void => {
    const previewBody: HTMLDivElement | null = previewBodyRef.current
    if (!previewBody) {
      return
    }
    const article: Element | null = previewBody.querySelector('.markdown-body')
    if (!article) {
      return
    }
    const headingElements: HTMLElement[] = Array.from(
      article.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
    )
    const headingOffsets: number[] = extractHeadingCharOffsets(markdown)
    sectionMapRef.current = buildSectionScrollMap(
      markdown,
      headingOffsets,
      previewBody,
      headingElements,
    )
  }, [markdown])

  useLayoutEffect(() => {
    let frame: number = 0
    frame = requestAnimationFrame(() => {
      rebuildSectionMap()
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [rebuildSectionMap, previewMarkdown])

  useLayoutEffect(() => {
    const previewBody: HTMLDivElement | null = previewBodyRef.current
    if (!previewBody) {
      return
    }
    const observer: ResizeObserver = new ResizeObserver(() => {
      rebuildSectionMap()
    })
    observer.observe(previewBody)
    return () => {
      observer.disconnect()
    }
  }, [rebuildSectionMap])

  const onEditorScroll = useCallback((): void => {
    if (!isSourceVisible || ignoreEditorScrollRef.current) {
      return
    }
    const textarea: HTMLTextAreaElement | null = editorRef.current
    const previewBody: HTMLDivElement | null = previewBodyRef.current
    const map: SectionScrollMap | null = sectionMapRef.current
    if (!textarea || !previewBody || !map) {
      return
    }
    ignorePreviewScrollRef.current = true
    const len: number = markdown.length
    const charIndex: number = textareaScrollToCharIndex(textarea, len)
    previewBody.scrollTop = sourceCharToPreviewScroll(map, charIndex)
    scheduleReleaseScrollIgnore(ignorePreviewScrollRef)
  }, [isSourceVisible, markdown])

  const onPreviewScroll = useCallback((): void => {
    if (!isSourceVisible || ignorePreviewScrollRef.current) {
      return
    }
    const textarea: HTMLTextAreaElement | null = editorRef.current
    const previewBody: HTMLDivElement | null = previewBodyRef.current
    const map: SectionScrollMap | null = sectionMapRef.current
    if (!textarea || !previewBody || !map) {
      return
    }
    ignoreEditorScrollRef.current = true
    const len: number = markdown.length
    const charIndex: number = previewScrollToSourceChar(map, previewBody.scrollTop)
    textarea.scrollTop = charIndexToTextareaScroll(textarea, len, charIndex)
    scheduleReleaseScrollIgnore(ignoreEditorScrollRef)
  }, [isSourceVisible, markdown])

  useLayoutEffect(() => {
    if (!isSourceVisible) {
      return
    }
    const textarea: HTMLTextAreaElement | null = editorRef.current
    const previewBody: HTMLDivElement | null = previewBodyRef.current
    if (!textarea || !previewBody) {
      return
    }
    textarea.addEventListener('scroll', onEditorScroll, { passive: true })
    previewBody.addEventListener('scroll', onPreviewScroll, { passive: true })
    return () => {
      textarea.removeEventListener('scroll', onEditorScroll)
      previewBody.removeEventListener('scroll', onPreviewScroll)
    }
  }, [isSourceVisible, onEditorScroll, onPreviewScroll])

  const onMermaidFenceReplace = useCallback(
    (args: MermaidFenceReplaceArgs): void => {
      setMarkdown((prev: string): string => {
        if (
          prev.slice(args.sourceRange.start, args.sourceRange.end) !==
          args.expectedFence
        ) {
          return prev
        }
        const newFence: string = buildMermaidFence(args.newInnerDiagram)
        const next: string =
          prev.slice(0, args.sourceRange.start) +
          newFence +
          prev.slice(args.sourceRange.end)
        const revertRange: { start: number; end: number } = {
          start: args.sourceRange.start,
          end: args.sourceRange.start + newFence.length,
        }
        queueMicrotask(() => {
          setMermaidAiRevert({
            range: revertRange,
            previousSlice: args.expectedFence,
            postFixSlice: newFence,
          })
        })
        return next
      })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!isSourceVisible) {
            return
          }
          const textarea: HTMLTextAreaElement | null = editorRef.current
          if (!textarea) {
            return
          }
          textarea.focus()
          textarea.setSelectionRange(
            args.sourceRange.start,
            args.sourceRange.start,
          )
        })
      })
    },
    [isSourceVisible],
  )

  const onUndoMermaidAi = useCallback((): void => {
    if (!mermaidAiRevert) {
      return
    }
    const { range, previousSlice, postFixSlice } = mermaidAiRevert
    setMarkdown((prev: string): string => {
      if (prev.slice(range.start, range.end) !== postFixSlice) {
        return prev
      }
      return (
        prev.slice(0, range.start) + previousSlice + prev.slice(range.end)
      )
    })
    setMermaidAiRevert(null)
  }, [mermaidAiRevert])

  const onDismissMermaidAi = useCallback((): void => {
    setMermaidAiRevert(null)
  }, [])

  const onFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file: File | undefined = event.target.files?.[0]
      event.target.value = ''
      if (!file) {
        return
      }
      setError(null)
      setMermaidAiRevert(null)
      setIsLoading(true)
      const lower: string = file.name.toLowerCase()
      const isMarkdown: boolean =
        lower.endsWith('.md') || lower.endsWith('.markdown')
      try {
        if (isMarkdown) {
          try {
            const content: string = await uploadMarkdownFile(file)
            setMarkdown(content)
            setFileName(file.name)
            return
          } catch (uploadErr: unknown) {
            if (uploadErr instanceof HttpError) {
              setError(uploadErr.message)
              return
            }
            const text: string = await readFileAsText(file)
            setMarkdown(text)
            setFileName(file.name)
            setError('Could not reach the server; showing local file contents.')
            return
          }
        }
        const text: string = await readFileAsText(file)
        setMarkdown(text)
        setFileName(file.name)
      } catch (err) {
        const message: string =
          err instanceof Error ? err.message : 'Failed to load file'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const closeExportMenu = useCallback((): void => {
    setIsExportMenuOpen(false)
  }, [])

  const onExportPdf = useCallback((): void => {
    closeExportMenu()
    if (markdown.trim() === '') {
      setError(EMPTY_EXPORT_MESSAGE)
      return
    }
    window.print()
  }, [markdown, closeExportMenu])

  const onExportDrawIo = useCallback((): void => {
    closeExportMenu()
    if (markdown.trim() === '') {
      setError(EMPTY_EXPORT_MESSAGE)
      return
    }
    setError(null)
    const xml: string = buildDrawIoMarkdownDocument({
      markdown,
      documentLabel: buildDocumentLabelFromFileName(fileName),
      modifiedIso: new Date().toISOString(),
    })
    triggerDrawIoDownload(xml, buildDrawIoDownloadFileName(fileName))
  }, [markdown, fileName, closeExportMenu])

  return (
    <div className="app" ref={appRef}>
      <header className="app-toolbar" ref={toolbarRef}>
        <h1 className="app-title">Markdown preview</h1>
        <div className="app-actions">
          <label className="file-button">
            {isLoading ? 'Loading…' : 'Choose .md file'}
            <input
              type="file"
              accept=".md,.markdown,text/markdown"
              onChange={onFileSelected}
              disabled={isLoading}
            />
          </label>
          {fileName ? (
            <span className="file-name" title={fileName}>
              {fileName}
            </span>
          ) : null}
          <div className="export-menu" ref={exportMenuRef}>
            <button
              type="button"
              className="file-button file-button--secondary export-menu__trigger"
              aria-haspopup="menu"
              aria-expanded={isExportMenuOpen}
              aria-controls={
                isExportMenuOpen ? 'export-menu-panel' : undefined
              }
              aria-label="Export menu"
              id="export-menu-trigger"
              disabled={isLoading}
              title="Export Markdown in another format"
              onClick={() => {
                setIsExportMenuOpen((open: boolean) => !open)
              }}
            >
              <span className="export-menu__trigger-text" aria-hidden="true">
                Export
              </span>
              <svg
                className={
                  isExportMenuOpen
                    ? 'export-menu__chevron export-menu__chevron--open'
                    : 'export-menu__chevron'
                }
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isExportMenuOpen ? (
              <div
                id="export-menu-panel"
                className="export-menu__panel"
                role="menu"
                aria-labelledby="export-menu-trigger"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu__item"
                  onClick={onExportPdf}
                >
                  <span className="export-menu__item-title">Save as PDF…</span>
                  <span className="export-menu__item-desc">
                    Opens the print dialog; choose Save as PDF
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu__item"
                  onClick={onExportDrawIo}
                >
                  <span className="export-menu__item-title">
                    draw.io document (.drawio)
                  </span>
                  <span className="export-menu__item-desc">
                    One page with your Markdown in an editable text shape
                  </span>
                </button>
              </div>
            ) : null}
          </div>
          <Link className="file-button app-toolbar__config-link" to="/settings">
            Configuration
          </Link>
        </div>
        {error ? <p className="app-error">{error}</p> : null}
      </header>
      <main className="app-main">
        <div
          className={
            isSourceVisible ? 'app-split' : 'app-split app-split--source-hidden'
          }
        >
          {isSourceVisible ? (
            <section
              id="markdown-source-panel"
              className="app-editor-pane"
              aria-labelledby="markdown-source-heading"
            >
              <div className="app-pane-header-row">
                <h2 id="markdown-source-heading" className="app-pane-heading">
                  Markdown source
                </h2>
                <SourceVisibilitySwitch
                  isOn={isSourceVisible}
                  onToggle={() => {
                    setIsSourceVisible((visible: boolean) => !visible)
                  }}
                  ariaControls="markdown-source-panel"
                />
              </div>
              <textarea
                ref={editorRef}
                className="app-editor"
                value={markdown}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  setMermaidAiRevert(null)
                  setMarkdown(e.target.value)
                }}
                spellCheck={false}
                autoComplete="off"
                aria-label="Edit Markdown source"
              />
            </section>
          ) : null}
          <section
            className="app-preview-pane"
            aria-labelledby="preview-heading"
          >
            <div className="app-pane-header-row">
              <h2 id="preview-heading" className="app-pane-heading">
                Preview
              </h2>
              {!isSourceVisible ? (
                <SourceVisibilitySwitch
                  isOn={isSourceVisible}
                  onToggle={() => {
                    setIsSourceVisible((visible: boolean) => !visible)
                  }}
                />
              ) : null}
            </div>
            {mermaidAiRevert ? (
              <div
                className="mermaid-ai-revert-banner"
                role="status"
                aria-live="polite"
              >
                <span className="mermaid-ai-revert-banner__text">
                  Diagram source was updated by AI.
                </span>
                <button
                  type="button"
                  className="file-button mermaid-ai-revert-banner__undo"
                  onClick={onUndoMermaidAi}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="file-button mermaid-ai-revert-banner__dismiss"
                  onClick={onDismissMermaidAi}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            <div className="app-preview-body" ref={previewBodyRef}>
              <MarkdownPreview
                markdown={previewMarkdown}
                onMermaidFenceReplace={onMermaidFenceReplace}
                groqApiKey={groqApiKey}
                groqModel={groqModel}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
