import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader: FileReader = new FileReader()
    reader.onload = (): void => {
      resolve(String(reader.result))
    }
    reader.onerror = (): void => {
      reject(new Error('Could not read blob'))
    }
    reader.readAsText(blob)
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

  it('downloads the rendered SVG from the diagram export button', async () => {
    const user = userEvent.setup()
    const createObjectUrl = vi.fn().mockReturnValue('blob:mermaid-svg')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    })
    const clickAnchor = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    render(<MermaidDiagram chart={'flowchart LR\n  A-->B'} />)
    await screen.findByTestId('mermaid-svg')
    await user.click(screen.getByText('Export SVG'))
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
    const blob: Blob = createObjectUrl.mock.calls[0][0] as Blob
    await expect(readBlobText(blob)).resolves.toContain(
      '<svg data-testid="mermaid-svg"></svg>',
    )
    expect(clickAnchor).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mermaid-svg')
    clickAnchor.mockRestore()
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
