import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_GROQ_CHAT_URL, DEFAULT_GROQ_MODEL } from '../groq_settings'

export interface ConfigurationPageProps {
  apiKey: string
  model: string
  onApiKeyChange: (value: string) => void
  onModelChange: (value: string) => void
}

export function ConfigurationPage(props: ConfigurationPageProps) {
  const { apiKey, model, onApiKeyChange, onModelChange } = props
  return (
    <div className="app app--config">
      <header className="app-toolbar app-toolbar--config">
        <div className="app-config-page__header-row">
          <Link className="file-button app-config-page__back" to="/">
            ← Back to preview
          </Link>
          <h1 className="app-title app-config-page__title">Configuration</h1>
        </div>
        <p className="app-config-page__intro">
          Groq settings for <strong>Fix with AI</strong> on Mermaid diagrams. The
          backend can also use <code className="app-groq-settings__code">GROQ_API_KEY</code>{' '}
          and <code className="app-groq-settings__code">GROQ_MODEL</code> instead of
          these fields.
        </p>
        <div className="app-groq-settings app-groq-settings--page">
          <div className="app-groq-settings__fields">
            <label className="app-groq-settings__label">
              <span className="app-groq-settings__label-text">Groq API key</span>
              <input
                className="app-groq-settings__input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="gsk_… (optional if set on server)"
                value={apiKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  onApiKeyChange(e.target.value)
                }}
                aria-label="Groq API key"
              />
            </label>
            <label className="app-groq-settings__label">
              <span className="app-groq-settings__label-text">Model id</span>
              <input
                className="app-groq-settings__input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={DEFAULT_GROQ_MODEL}
                value={model}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  onModelChange(e.target.value)
                }}
                aria-label="Groq model id"
              />
            </label>
            <label className="app-groq-settings__label app-groq-settings__label--full">
              <span className="app-groq-settings__label-text">API endpoint</span>
              <input
                className="app-groq-settings__input"
                type="url"
                readOnly
                aria-readonly="true"
                value={DEFAULT_GROQ_CHAT_URL}
                aria-label="Default Groq chat completions URL used by the server"
              />
            </label>
          </div>
          <p className="app-groq-settings__hint">
            Values are stored in this browser only (localStorage). Do not use a
            production secret in a shared or public environment.
          </p>
        </div>
      </header>
      <main className="app-main app-config-page__main" />
    </div>
  )
}
