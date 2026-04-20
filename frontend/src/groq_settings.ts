/** Groq OpenAI-compatible chat endpoint; keep in sync with backend `GROQ_CHAT_URL` in `app/main.py`. */
export const DEFAULT_GROQ_CHAT_URL: string =
  'https://api.groq.com/openai/v1/chat/completions'

/** Default model id; keep in sync with backend `DEFAULT_GROQ_MODEL` in `app/main.py`. */
export const DEFAULT_GROQ_MODEL: string = 'qwen/qwen3-32b'

const STORAGE_KEY_API: string = 'markdown-preview:groq-api-key'
const STORAGE_KEY_MODEL: string = 'markdown-preview:groq-model'

export interface GroqSettingsSnapshot {
  apiKey: string
  model: string
}

export function readGroqSettingsFromStorage(): GroqSettingsSnapshot {
  try {
    const apiKey: string = localStorage.getItem(STORAGE_KEY_API) ?? ''
    const storedModel: string | null = localStorage.getItem(STORAGE_KEY_MODEL)
    const model: string =
      storedModel !== null && storedModel !== ''
        ? storedModel
        : DEFAULT_GROQ_MODEL
    return { apiKey, model }
  } catch {
    return { apiKey: '', model: DEFAULT_GROQ_MODEL }
  }
}

export function persistGroqApiKey(apiKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_API, apiKey)
  } catch {
    /* ignore quota / private mode */
  }
}

export function persistGroqModel(model: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_MODEL, model)
  } catch {
    /* ignore */
  }
}
