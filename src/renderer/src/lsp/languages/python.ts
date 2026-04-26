import type { LanguageSupport } from '../types'

export const pythonLanguageSupport: LanguageSupport = {
  languageId: 'python',
  extensions: ['.py', '.pyi'],
  aliases: ['Python', 'py'],
  clients: [
    {
      id: 'pyright-python',
      server: 'pyright',
      languageId: 'python',
      documentSelector: [{ language: 'python' }],
      initializationOptions: {
        python: {
          analysis: {
            autoSearchPaths: true,
            useLibraryCodeForTypes: true,
            diagnosticMode: 'workspace',
            typeCheckingMode: 'basic'
          }
        }
      },
      features: {
        completion: true,
        hover: true,
        signatureHelp: true,
        definition: true,
        references: true,
        rename: true,
        diagnostics: true,
        formatting: false
      }
    },
    {
      id: 'ruff-python',
      server: 'ruff',
      languageId: 'python',
      documentSelector: [{ language: 'python' }],
      initializationOptions: {},
      features: {
        completion: false,
        hover: false,
        signatureHelp: false,
        definition: false,
        references: false,
        rename: false,
        diagnostics: true,
        formatting: true
      }
    }
  ]
}
