import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('calls onFenceReplaced after Fix with AI when verify succeeds', async () => {
    const user = userEvent.setup()
    mockRender
      .mockRejectedValueOnce(new Error('parse failed'))
      .mockResolvedValueOnce({
        svg: '<svg data-testid="mermaid-svg"></svg>',
        bindFunctions: undefined,
      })
    const onFenceReplaced = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ fixed_chart: 'flowchart LR\n  A --> B' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MermaidDiagram
        chart={'bad'}
        sourceRange={{ start: 0, end: 20 }}
        expectedFence={'```mermaid\nbad\n```'}
        onFenceReplaced={onFenceReplaced}
      />,
    )
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /fix with ai/i }))
    await waitFor(() => {
      expect(onFenceReplaced).toHaveBeenCalledWith({
        sourceRange: { start: 0, end: 20 },
        expectedFence: '```mermaid\nbad\n```',
        newInnerDiagram: 'flowchart LR\n  A --> B',
      })
    })
    expect(fetchMock).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
