import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MERMAID_OK_SVG: { svg: string; bindFunctions: undefined } = {
  svg: '<svg data-testid="mock-svg"></svg>',
  bindFunctions: undefined,
}

const { mockInitialize, mockRender } = vi.hoisted(() => ({
  mockInitialize: vi.fn(),
  mockRender: vi.fn(),
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: mockInitialize,
    render: mockRender,
  },
}))

import App from './App'

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  beforeEach(() => {
    mockInitialize.mockClear()
    mockRender.mockReset()
    mockRender.mockResolvedValue(MERMAID_OK_SVG)
  })

  it('navigates to configuration page and back', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('link', { name: /^configuration$/i }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Configuration' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /back to preview/i }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Markdown preview' }),
    ).toBeInTheDocument()
  })

  it('exports PDF via print', async () => {
    const printSpy: ReturnType<typeof vi.spyOn> = vi
      .spyOn(window, 'print')
      .mockImplementation(() => {})
    const user = userEvent.setup()
    renderApp()
    await user.click(
      screen.getByRole('button', { name: /export preview as pdf/i }),
    )
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
  })

  it('shows empty export message when PDF export has no content', async () => {
    const user = userEvent.setup()
    renderApp()
    const editor: HTMLTextAreaElement = screen.getByRole('textbox', {
      name: /edit markdown source/i,
    })
    fireEvent.change(editor, { target: { value: '   ' } })
    await user.click(
      screen.getByRole('button', { name: /export preview as pdf/i }),
    )
    expect(screen.getByText(/nothing to export/i)).toBeInTheDocument()
  })

  it('renders toolbar title and default markdown', () => {
    renderApp()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Markdown preview' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Markdown source' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Markdown + Mermaid' }),
    ).toBeInTheDocument()
  })

  it('toggles markdown source panel with header switch', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(
      screen.getByRole('textbox', { name: /edit markdown source/i }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('switch', { name: 'Markdown source panel' }),
    )
    expect(
      screen.queryByRole('textbox', { name: /edit markdown source/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Markdown source' })).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('switch', { name: 'Markdown source panel' }),
    )
    expect(
      screen.getByRole('textbox', { name: /edit markdown source/i }),
    ).toBeInTheDocument()
  })

  it('updates preview when Markdown source is edited', async () => {
    renderApp()
    const editor: HTMLTextAreaElement = screen.getByRole('textbox', {
      name: /edit markdown source/i,
    })
    fireEvent.change(editor, { target: { value: '# Typed live' } })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Typed live' }),
      ).toBeInTheDocument()
    })
  })

  it('posts .md files to the preview API when fetch succeeds', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: '# From API\n' }),
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    const input: HTMLInputElement = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file: File = new File(['local'], 'doc.md', {
      type: 'text/markdown',
    })
    await user.upload(input, file)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'From API' }),
      ).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/preview/upload',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(screen.getByTitle('doc.md')).toBeInTheDocument()
  })

  it('shows API error message for 400 responses', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ detail: 'bad file' }),
      text: async () => JSON.stringify({ detail: 'bad file' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    const input: HTMLInputElement = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    await user.upload(
      input,
      new File(['x'], 'bad.md', { type: 'text/markdown' }),
    )
    await waitFor(() => {
      expect(screen.getByText('bad file')).toBeInTheDocument()
    })
  })

  it('shows API error for 500 responses without replacing preview', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ detail: 'server failed' }),
      text: async () => JSON.stringify({ detail: 'server failed' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    const input: HTMLInputElement = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    await user.upload(
      input,
      new File(['# would not show'], 'x.md', { type: 'text/markdown' }),
    )
    await waitFor(() => {
      expect(screen.getByText('server failed')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Markdown + Mermaid' }),
    ).toBeInTheDocument()
  })

  it('falls back to local file when fetch fails (network)', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    const input: HTMLInputElement = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    await user.upload(
      input,
      new File(['# Offline doc'], 'net.md', { type: 'text/markdown' }),
    )
    expect(
      await screen.findByText(/could not reach the server/i),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Offline doc' }),
    ).toBeInTheDocument()
    expect(document.querySelector('[title="net.md"]')).not.toBeNull()
  })

  const BAD_MERMAID_DOC: string = `# Doc

\`\`\`mermaid
notvaliddiagramsyntax123
\`\`\`
`

  it('shows preview revert banner after AI fixes mermaid; dismiss hides it', async () => {
    const user = userEvent.setup()
    mockRender.mockImplementation(
      async (_id: string, chart: string): Promise<typeof MERMAID_OK_SVG> => {
        if (chart.includes('notvaliddiagramsyntax123')) {
          throw new Error('bad chart')
        }
        return MERMAID_OK_SVG
      },
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ fixed_chart: 'flowchart LR\n  A-->B' }),
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    const editor: HTMLTextAreaElement = screen.getByRole('textbox', {
      name: /edit markdown source/i,
    })
    fireEvent.change(editor, { target: { value: BAD_MERMAID_DOC } })
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /fix with ai/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /fix with ai/i }))
    await waitFor(() => {
      expect(
        screen.getByText('Diagram source was updated by AI.'),
      ).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^dismiss$/i }))
    expect(
      screen.queryByText('Diagram source was updated by AI.'),
    ).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('undo on revert banner restores the previous mermaid fence', async () => {
    const user = userEvent.setup()
    mockRender.mockImplementation(
      async (_id: string, chart: string): Promise<typeof MERMAID_OK_SVG> => {
        if (chart.includes('notvaliddiagramsyntax123')) {
          throw new Error('bad chart')
        }
        return MERMAID_OK_SVG
      },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ fixed_chart: 'flowchart LR\n  A-->B' }),
        text: async () => '',
      }),
    )
    renderApp()
    const editor: HTMLTextAreaElement = screen.getByRole('textbox', {
      name: /edit markdown source/i,
    })
    fireEvent.change(editor, { target: { value: BAD_MERMAID_DOC } })
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /fix with ai/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /fix with ai/i }))
    await screen.findByText('Diagram source was updated by AI.')
    await waitFor(() => {
      expect(editor.value).toContain('flowchart LR')
    })
    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    expect(editor.value).toContain('notvaliddiagramsyntax123')
    expect(editor.value).not.toContain('flowchart LR')
    vi.unstubAllGlobals()
  })

  it('clears revert banner when markdown is edited manually', async () => {
    const user = userEvent.setup()
    mockRender.mockImplementation(
      async (_id: string, chart: string): Promise<typeof MERMAID_OK_SVG> => {
        if (chart.includes('notvaliddiagramsyntax123')) {
          throw new Error('bad chart')
        }
        return MERMAID_OK_SVG
      },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ fixed_chart: 'flowchart LR\n  A-->B' }),
        text: async () => '',
      }),
    )
    renderApp()
    const editor: HTMLTextAreaElement = screen.getByRole('textbox', {
      name: /edit markdown source/i,
    })
    fireEvent.change(editor, { target: { value: BAD_MERMAID_DOC } })
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /fix with ai/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /fix with ai/i }))
    await screen.findByText('Diagram source was updated by AI.')
    await user.type(editor, ' ')
    expect(
      screen.queryByText('Diagram source was updated by AI.'),
    ).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
