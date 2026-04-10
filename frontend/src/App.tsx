import {
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { MarkdownPreview } from './components/markdown_preview'
import {
  buildSectionScrollMap,
  charIndexToTextareaScroll,
  extractHeadingCharOffsets,
  previewScrollToSourceChar,
  sourceCharToPreviewScroll,
  textareaScrollToCharIndex,
  type SectionScrollMap,
} from './scroll_sync'
import './App.css'

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

export default function App() {
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
    requestAnimationFrame(() => {
      ignorePreviewScrollRef.current = false
    })
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
    requestAnimationFrame(() => {
      ignoreEditorScrollRef.current = false
    })
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

  const onFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file: File | undefined = event.target.files?.[0]
      event.target.value = ''
      if (!file) {
        return
      }
      setError(null)
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
            <div className="app-preview-body" ref={previewBodyRef}>
              <MarkdownPreview markdown={previewMarkdown} />
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
