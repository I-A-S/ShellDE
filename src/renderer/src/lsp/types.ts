import * as monaco from 'monaco-editor'

export type LspServerId = string

export type LspClientFeatures = {
  completion?: boolean
  hover?: boolean
  signatureHelp?: boolean
  definition?: boolean
  references?: boolean
  rename?: boolean
  formatting?: boolean
  diagnostics?: boolean
}

export type LanguageClientConfig = {
  id: string
  server: LspServerId
  languageId: string
  documentSelector: monaco.languages.LanguageSelector
  initializationOptions?: unknown
  command?: string
  args?: string[]
  env?: Record<string, string>
  features?: LspClientFeatures
}

export type LanguageSupport = {
  languageId: string
  extensions: string[]
  aliases: string[]
  clients: LanguageClientConfig[]
}
