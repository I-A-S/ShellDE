import * as monaco from 'monaco-editor'
import { pythonLanguageSupport } from './languages/python'
import type { LanguageClientConfig, LanguageSupport } from './types'

const builtInLanguageSupports: LanguageSupport[] = [pythonLanguageSupport]

const validateLanguageSupports = (supports: LanguageSupport[]): void => {
  const languageIds = new Set<string>()
  const clientIds = new Set<string>()

  for (const support of supports) {
    if (languageIds.has(support.languageId)) {
      throw new Error(`Duplicate language support registration: ${support.languageId}`)
    }
    languageIds.add(support.languageId)

    for (const client of support.clients) {
      if (clientIds.has(client.id)) {
        throw new Error(`Duplicate LSP client id: ${client.id}`)
      }
      clientIds.add(client.id)
    }
  }
}

let validationDone = false
const ensureValidSupports = (): void => {
  if (validationDone) return
  validateLanguageSupports(builtInLanguageSupports)
  validationDone = true
}

export const registerBuiltInLanguages = (): void => {
  ensureValidSupports()
  for (const support of builtInLanguageSupports) {
    const exists = monaco.languages.getLanguages().some((entry) => entry.id === support.languageId)
    if (exists) continue
    monaco.languages.register({
      id: support.languageId,
      extensions: support.extensions,
      aliases: support.aliases
    })
  }

  const languageIds = builtInLanguageSupports.map((entry) => entry.languageId)
  console.info('[lsp:registry] built-in languages:', languageIds.join(', '))
}

export const getBuiltInLspClientConfigs = (): LanguageClientConfig[] => {
  ensureValidSupports()
  const configs = builtInLanguageSupports.flatMap((entry) => entry.clients)
  console.info(
    '[lsp:registry] built-in clients:',
    configs.map((entry) => `${entry.id}:${entry.server}`).join(', ')
  )
  return configs
}
