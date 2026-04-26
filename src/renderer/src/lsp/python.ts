import * as monaco from 'monaco-editor'
import { pythonLanguageSupport } from './languages/python'
import type { LanguageClientConfig } from './types'

let pythonRegistered = false

export const ensurePythonLanguageRegistered = (): void => {
  if (pythonRegistered) return
  pythonRegistered = true
  const existing = monaco.languages.getLanguages().some((entry) => entry.id === 'python')
  if (existing) return
  monaco.languages.register({
    id: 'python',
    extensions: ['.py', '.pyi'],
    aliases: ['Python', 'py']
  })
}

export const buildPyrightClientConfig = (id = 'pyright-python'): LanguageClientConfig => ({
  ...pythonLanguageSupport.clients[0],
  id
})

export const buildRuffClientConfig = (id = 'ruff-python'): LanguageClientConfig => ({
  ...pythonLanguageSupport.clients[1],
  id
})
