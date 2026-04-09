import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInitialize, mockRender } = vi.hoisted(() => ({
  mockInitialize: vi.fn(),
  mockRender: vi.fn().mockResolvedValue({
    svg: '<svg data-testid="mermaid-svg"></svg>',
    bindFunctions: undefined,
  }),
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: mockInitialize,
    render: mockRender,
  },
}))

import { MermaidDiagram } from './mermaid_diagram'

describe('MermaidDiagram', () => {
  beforeEach(() => {
    mockInitialize.mockClear()
    mockRender.mockClear()
  })

  it('initializes mermaid and renders SVG via mermaid.render', async () => {
    const chart: string = `flowchart LR
  A-->B`
    render(<MermaidDiagram chart={chart} />)
    const el: HTMLDivElement | null = document.querySelector('.mermaid')
    expect(el).not.toBeNull()
    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalled()
      expect(mockRender).toHaveBeenCalled()
    })
    expect(mockRender.mock.calls[0][0]).toMatch(/^mmd-/)
    expect(mockRender.mock.calls[0][1]).toBe(chart)
    expect(mockRender.mock.calls[0][2]).toBe(el)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="mermaid-svg"]')).not.toBeNull()
    })
  })
})
