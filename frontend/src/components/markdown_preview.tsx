import type { ComponentPropsWithoutRef } from 'react'
import { useMemo } from 'react'
import type { Components } from 'react-markdown'
import type { ExtraProps } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidDiagram } from './mermaid_diagram'
import {
  buildMermaidSvgFileName,
  type MermaidSvgExportChangeHandler,
} from '../mermaid_svg_export'

export interface MermaidFenceReplaceArgs {
  sourceRange: { start: number; end: number }
  expectedFence: string
  newInnerDiagram: string
}

export interface MarkdownPreviewProps {
  markdown: string
  onMermaidFenceReplace?: (args: MermaidFenceReplaceArgs) => void
  groqApiKey?: string
  groqModel?: string
  onMermaidSvgExportChange?: MermaidSvgExportChangeHandler
}

const LANGUAGE_PATTERN: RegExp = /language-(\w+)/

interface MarkdownCodeProps
  extends ComponentPropsWithoutRef<'code'>,
    ExtraProps {
  inline?: boolean
}

function createMarkdownComponents(
  markdown: string,
  onMermaidFenceReplace?: (args: MermaidFenceReplaceArgs) => void,
  groqApiKey?: string,
  groqModel?: string,
  onMermaidSvgExportChange?: MermaidSvgExportChangeHandler,
): Components {
  /**
   * react-markdown renders fenced code in document order, so the first time a
   * fence is seen its position in this map is its position in the document.
   * Caching by fence key keeps the number stable when a single diagram
   * re-renders on its own.
   */
  const exportIndexByKey: Map<string, number> = new Map()
  const resolveExportIndex = (key: string): number => {
    const known: number | undefined = exportIndexByKey.get(key)
    if (known !== undefined) {
      return known
    }
    const next: number = exportIndexByKey.size
    exportIndexByKey.set(key, next)
    return next
  }
  return {
    code(props: MarkdownCodeProps) {
      const { className, children, inline, node, ...rest } = props
      const langMatch: RegExpMatchArray | null =
        className?.match(LANGUAGE_PATTERN) ?? null
      const language: string = langMatch?.[1] ?? ''
      const text: string = String(children).replace(/\n$/, '')
      if (language === 'mermaid' && !inline) {
        const start: number | undefined = node?.position?.start?.offset
        const end: number | undefined = node?.position?.end?.offset
        const sourceRange: { start: number; end: number } | null =
          start !== undefined && end !== undefined ? { start, end } : null
        const expectedFence: string | undefined =
          sourceRange !== null
            ? markdown.slice(sourceRange.start, sourceRange.end)
            : undefined
        const exportKey: string =
          sourceRange !== null
            ? `${sourceRange.start}-${sourceRange.end}`
            : text
        const exportIndex: number = resolveExportIndex(exportKey)
        return (
          <MermaidDiagram
            chart={text}
            sourceRange={sourceRange}
            expectedFence={expectedFence}
            onFenceReplaced={onMermaidFenceReplace}
            groqApiKey={groqApiKey}
            groqModel={groqModel}
            exportId={`mermaid-${exportKey}`}
            exportFileName={buildMermaidSvgFileName(exportIndex)}
            exportOrder={exportIndex}
            onSvgExportChange={onMermaidSvgExportChange}
          />
        )
      }
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      )
    },
  }
}

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const {
    markdown,
    onMermaidFenceReplace,
    groqApiKey,
    groqModel,
    onMermaidSvgExportChange,
  } = props
  const components: Components = useMemo(
    () =>
      createMarkdownComponents(
        markdown,
        onMermaidFenceReplace,
        groqApiKey,
        groqModel,
        onMermaidSvgExportChange,
      ),
    [
      markdown,
      onMermaidFenceReplace,
      groqApiKey,
      groqModel,
      onMermaidSvgExportChange,
    ],
  )
  return (
    <article className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </article>
  )
}
