import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MarkdownWorkspace } from './markdown_workspace'
import { ConfigurationPage } from './pages/configuration_page'
import {
  persistGroqApiKey,
  persistGroqModel,
  readGroqSettingsFromStorage,
} from './groq_settings'
import './App.css'

export default function App() {
  const [groqApiKey, setGroqApiKey] = useState<string>(
    () => readGroqSettingsFromStorage().apiKey,
  )
  const [groqModel, setGroqModel] = useState<string>(
    () => readGroqSettingsFromStorage().model,
  )
  return (
    <Routes>
      <Route
        path="/"
        element={
          <MarkdownWorkspace groqApiKey={groqApiKey} groqModel={groqModel} />
        }
      />
      <Route
        path="/settings"
        element={
          <ConfigurationPage
            apiKey={groqApiKey}
            model={groqModel}
            onApiKeyChange={(value: string) => {
              setGroqApiKey(value)
              persistGroqApiKey(value)
            }}
            onModelChange={(value: string) => {
              setGroqModel(value)
              persistGroqModel(value)
            }}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
