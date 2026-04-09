import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({
      svg: '<svg data-testid="mock-svg"></svg>',
      bindFunctions: undefined,
    }),
  },
}))

import { MarkdownPreview } from './markdown_preview'

describe('MarkdownPreview', () => {
  it('renders headings and inline emphasis', () => {
    render(<MarkdownPreview markdown={'# Title\n\n**Bold** line.'} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Title' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Bold')).toBeInTheDocument()
  })

  it('renders GFM table cells', () => {
    const md: string =
      '| A | B |\n| - | - |\n| 1 | 2 |\n'
    render(<MarkdownPreview markdown={md} />)
    expect(
      screen.getByRole('columnheader', { name: 'A' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument()
  })

  it('uses MermaidDiagram for fenced mermaid blocks', () => {
    const md: string = '```mermaid\nflowchart LR\n  X-->Y\n```'
    render(<MarkdownPreview markdown={md} />)
    expect(document.querySelector('.mermaid')).not.toBeNull()
  })
})
