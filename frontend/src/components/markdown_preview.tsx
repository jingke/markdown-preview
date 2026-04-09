import type { ComponentPropsWithoutRef } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidDiagram } from './mermaid_diagram'

export interface MarkdownPreviewProps {
  markdown: string
}

const LANGUAGE_PATTERN: RegExp = /language-(\w+)/

interface MarkdownCodeProps extends ComponentPropsWithoutRef<'code'> {
  inline?: boolean
}

const markdownComponents: Components = {
  code(props) {
    const { className, children, inline, ...rest } = props as MarkdownCodeProps
    const langMatch: RegExpMatchArray | null =
      className?.match(LANGUAGE_PATTERN) ?? null
    const language: string = langMatch?.[1] ?? ''
    const text: string = String(children).replace(/\n$/, '')
    if (language === 'mermaid' && !inline) {
      return <MermaidDiagram chart={text} />
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  },
}

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const { markdown } = props
  return (
    <article className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </article>
  )
}
