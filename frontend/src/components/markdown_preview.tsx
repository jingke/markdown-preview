import type { ComponentPropsWithoutRef } from 'react'
import { useMemo } from 'react'
import type { Components } from 'react-markdown'
import type { ExtraProps } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidDiagram } from './mermaid_diagram'

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
): Components {
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
        return (
          <MermaidDiagram
            chart={text}
            sourceRange={sourceRange}
            expectedFence={expectedFence}
            onFenceReplaced={onMermaidFenceReplace}
            groqApiKey={groqApiKey}
            groqModel={groqModel}
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
  const { markdown, onMermaidFenceReplace, groqApiKey, groqModel } = props
  const components: Components = useMemo(
    () =>
      createMarkdownComponents(
        markdown,
        onMermaidFenceReplace,
        groqApiKey,
        groqModel,
      ),
    [markdown, onMermaidFenceReplace, groqApiKey, groqModel],
  )
  return (
    <article className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </article>
  )
}
