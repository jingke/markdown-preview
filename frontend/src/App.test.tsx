import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({
      svg: '<svg data-testid="mock-svg"></svg>',
      bindFunctions: undefined,
    }),
  },
}))

import App from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders toolbar title and default markdown', () => {
    render(<App />)
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

  it('updates preview when Markdown source is edited', () => {
    render(<App />)
    const editor: HTMLTextAreaElement = screen.getByRole('textbox', {
      name: /edit markdown source/i,
    })
    fireEvent.change(editor, { target: { value: '# Typed live' } })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Typed live' }),
    ).toBeInTheDocument()
  })

  it('posts .md files to the preview API when fetch succeeds', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: '# From API\n' }),
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
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
    render(<App />)
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
})
