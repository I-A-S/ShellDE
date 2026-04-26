import * as monaco from 'monaco-editor'
import { LspConnection } from './transport'
import type { LanguageClientConfig } from './types'
import {
  lspCompletionListToMonaco,
  lspCompletionItemToMonaco,
  lspDiagnosticsToMarkers,
  lspHoverToMonaco,
  lspLocationsToMonaco,
  lspSignatureHelpToMonaco,
  lspWorkspaceEditToMonaco,
  lspTextEditsToMonaco,
  monacoCompletionContextToLsp,
  monacoFormattingOptionsToLsp,
  monacoPositionToLsp,
  monacoSignatureContextToLsp,
  pathFromUri,
  uriFromPath
} from './conversions'

const defaultFeatures = {
  completion: true,
  hover: true,
  signatureHelp: true,
  definition: true,
  references: true,
  rename: true,
  formatting: true,
  diagnostics: true
}

type ServerCapabilities = {
  completionProvider?: {
    triggerCharacters?: string[]
    resolveProvider?: boolean
  }
  signatureHelpProvider?: {
    triggerCharacters?: string[]
  }
  definitionProvider?: boolean
  referencesProvider?: boolean
  renameProvider?: boolean | { prepareProvider?: boolean }
  documentFormattingProvider?: boolean
  hoverProvider?: boolean
  textDocumentSync?: number | { change?: number }
}

const TextDocumentSyncKind = { None: 0, Full: 1, Incremental: 2 } as const

const matchesSelector = (
  model: monaco.editor.ITextModel,
  selector: monaco.languages.LanguageSelector
): boolean => {
  const arr = Array.isArray(selector) ? selector : [selector]
  for (const entry of arr) {
    if (typeof entry === 'string') {
      if (entry === model.getLanguageId()) return true
      continue
    }
    if (entry && typeof entry === 'object' && 'language' in entry) {
      if (entry.language === model.getLanguageId()) return true
    }
  }
  return false
}

export class LanguageClientHost {
  private connection: LspConnection | null = null
  private capabilities: ServerCapabilities = {}
  private initializedPromise: Promise<void> | null = null
  private openDocuments = new Map<string, { version: number; model: monaco.editor.ITextModel }>()
  private modelDisposables = new Map<string, monaco.IDisposable>()
  private monacoDisposables: monaco.IDisposable[] = []
  private changeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly markersOwner: string
  private workspaceRoot: string | undefined
  private stopped = false

  constructor(
    private readonly config: LanguageClientConfig,
    workspaceRoot?: string
  ) {
    this.workspaceRoot = workspaceRoot
    this.markersOwner = `lsp:${config.id}`
  }

  getId(): string {
    return this.config.id
  }

  async start(): Promise<void> {
    if (this.connection) return
    this.stopped = false

    const spawnResult = await window.lsp.spawn({
      id: this.config.id,
      server: this.config.server,
      workspaceRoot: this.workspaceRoot,
      command: this.config.command,
      args: this.config.args,
      env: this.config.env
    })
    if (!spawnResult.ok) {
      throw new Error(`Failed to spawn LSP server '${this.config.id}': ${spawnResult.error}`)
    }

    this.connection = new LspConnection({
      serverId: this.config.id,
      onError: (error) => console.warn(`[lsp:${this.config.id}]`, error.message),
      onStderr: (text) => console.debug(`[lsp:${this.config.id}:stderr]`, text),
      onExit: () => {
        this.connection = null
        this.openDocuments.clear()
      }
    })

    this.connection.onNotification(
      'textDocument/publishDiagnostics',
      (params) => this.handlePublishDiagnostics(params)
    )

    this.connection.onNotification('window/logMessage', (params) => {
      const value = params as { type?: number; message?: string }
      console.debug(`[lsp:${this.config.id}:log]`, value?.message)
    })
    this.connection.onNotification('window/showMessage', (params) => {
      const value = params as { type?: number; message?: string }
      console.info(`[lsp:${this.config.id}]`, value?.message)
    })

    this.connection.onRequest('workspace/configuration', (params) => {
      const value = params as { items?: unknown[] } | undefined
      const count = Array.isArray(value?.items) ? value.items.length : 1
      return new Array(count).fill(null)
    })
    this.connection.onRequest('client/registerCapability', () => null)
    this.connection.onRequest('client/unregisterCapability', () => null)
    this.connection.onRequest('window/workDoneProgress/create', () => null)

    this.initializedPromise = this.initialize()
    await this.initializedPromise

    this.attachToExistingModels()
    this.monacoDisposables.push(
      monaco.editor.onDidCreateModel((model) => {
        if (matchesSelector(model, this.config.documentSelector)) {
          this.openDocument(model)
        }
      }),
      monaco.editor.onWillDisposeModel((model) => {
        if (this.openDocuments.has(model.uri.toString())) {
          this.closeDocument(model)
        }
      })
    )

    this.registerProviders()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true

    for (const timer of this.changeTimers.values()) clearTimeout(timer)
    this.changeTimers.clear()

    for (const disposable of this.modelDisposables.values()) disposable.dispose()
    this.modelDisposables.clear()

    for (const [uri, info] of this.openDocuments) {
      monaco.editor.setModelMarkers(info.model, this.markersOwner, [])
      void uri
    }
    this.openDocuments.clear()

    for (const disposable of this.monacoDisposables) disposable.dispose()
    this.monacoDisposables.length = 0

    this.connection?.dispose()
    this.connection = null
  }

  async restart(workspaceRoot: string | undefined): Promise<void> {
    this.workspaceRoot = workspaceRoot
    this.stop()
    await this.start()
  }

  private async initialize(): Promise<void> {
    if (!this.connection) throw new Error('No connection')

    const rootUri = this.workspaceRoot ? uriFromPath(this.workspaceRoot) : null
    const workspaceFolders = this.workspaceRoot
      ? [{ uri: uriFromPath(this.workspaceRoot), name: 'workspace' }]
      : null

    const result = (await this.connection.sendRequest('initialize', {
      processId: null,
      clientInfo: { name: 'shellde', version: '1.0.0' },
      locale: 'en',
      rootPath: this.workspaceRoot ?? null,
      rootUri,
      workspaceFolders,
      initializationOptions: this.config.initializationOptions ?? null,
      capabilities: {
        workspace: {
          applyEdit: true,
          workspaceEdit: { documentChanges: true },
          configuration: true,
          workspaceFolders: true,
          didChangeConfiguration: { dynamicRegistration: false },
          didChangeWatchedFiles: { dynamicRegistration: false }
        },
        textDocument: {
          synchronization: {
            didSave: false,
            willSave: false,
            willSaveWaitUntil: false,
            dynamicRegistration: false
          },
          publishDiagnostics: { relatedInformation: true, versionSupport: true },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true,
              insertReplaceSupport: true,
              resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
              documentationFormat: ['markdown', 'plaintext']
            },
            contextSupport: true
          },
          hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: {
            dynamicRegistration: false,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true },
              activeParameterSupport: true
            }
          },
          definition: { dynamicRegistration: false, linkSupport: false },
          references: { dynamicRegistration: false },
          rename: { dynamicRegistration: false, prepareSupport: true },
          formatting: { dynamicRegistration: false }
        }
      }
    })) as { capabilities?: ServerCapabilities }

    this.capabilities = result.capabilities ?? {}
    this.connection.sendNotification('initialized', {})
    this.connection.sendNotification('workspace/didChangeConfiguration', { settings: {} })
  }

  private attachToExistingModels(): void {
    for (const model of monaco.editor.getModels()) {
      if (matchesSelector(model, this.config.documentSelector)) {
        this.openDocument(model)
      }
    }
  }

  private openDocument(model: monaco.editor.ITextModel): void {
    if (!this.connection) return
    const uri = model.uri.toString()
    if (this.openDocuments.has(uri)) return
    const version = 1
    this.openDocuments.set(uri, { version, model })
    this.connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.config.languageId,
        version,
        text: model.getValue()
      }
    })

    const sub = model.onDidChangeContent(() => this.queueDidChange(model))
    this.modelDisposables.set(uri, sub)
  }

  private closeDocument(model: monaco.editor.ITextModel): void {
    if (!this.connection) return
    const uri = model.uri.toString()
    if (!this.openDocuments.has(uri)) return
    this.openDocuments.delete(uri)
    monaco.editor.setModelMarkers(model, this.markersOwner, [])
    const sub = this.modelDisposables.get(uri)
    if (sub) {
      sub.dispose()
      this.modelDisposables.delete(uri)
    }
    const timer = this.changeTimers.get(uri)
    if (timer) {
      clearTimeout(timer)
      this.changeTimers.delete(uri)
    }
    this.connection.sendNotification('textDocument/didClose', {
      textDocument: { uri }
    })
  }

  private queueDidChange(model: monaco.editor.ITextModel): void {
    const uri = model.uri.toString()
    const existing = this.changeTimers.get(uri)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.changeTimers.delete(uri)
      this.flushDidChange(model)
    }, 150)
    this.changeTimers.set(uri, timer)
  }

  private flushDidChange(model: monaco.editor.ITextModel): void {
    if (!this.connection) return
    const uri = model.uri.toString()
    const info = this.openDocuments.get(uri)
    if (!info) return
    info.version += 1
    this.connection.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: info.version },
      contentChanges: [{ text: model.getValue() }]
    })
  }

  private handlePublishDiagnostics(params: unknown): void {
    const value = params as { uri?: string; diagnostics?: unknown[] }
    if (!value?.uri) return
    const targetPath = pathFromUri(value.uri)
    let model: monaco.editor.ITextModel | null = null
    for (const candidate of monaco.editor.getModels()) {
      if (
        candidate.uri.toString() === value.uri ||
        (targetPath && candidate.uri.fsPath.toLowerCase() === targetPath.toLowerCase())
      ) {
        model = candidate
        break
      }
    }
    if (!model) return
    const markers = lspDiagnosticsToMarkers(value.diagnostics ?? [])
    monaco.editor.setModelMarkers(model, this.markersOwner, markers)
  }

  private registerProviders(): void {
    const features = { ...defaultFeatures, ...(this.config.features ?? {}) }
    const selector = this.config.documentSelector

    if (features.hover && this.capabilities.hoverProvider) {
      this.monacoDisposables.push(
        monaco.languages.registerHoverProvider(selector, {
          provideHover: async (model, position) => {
            if (!this.connection) return null
            try {
              const result = await this.connection.sendRequest('textDocument/hover', {
                textDocument: { uri: model.uri.toString() },
                position: monacoPositionToLsp(position)
              })
              return lspHoverToMonaco(result)
            } catch {
              return null
            }
          }
        })
      )
    }

    if (features.completion && this.capabilities.completionProvider) {
      const triggerCharacters = this.capabilities.completionProvider.triggerCharacters ?? [
        '.',
        '(',
        '[',
        ',',
        ' '
      ]
      this.monacoDisposables.push(
        monaco.languages.registerCompletionItemProvider(selector, {
          triggerCharacters,
          provideCompletionItems: async (model, position, context) => {
            if (!this.connection) return { suggestions: [] }
            try {
              const result = await this.connection.sendRequest('textDocument/completion', {
                textDocument: { uri: model.uri.toString() },
                position: monacoPositionToLsp(position),
                context: monacoCompletionContextToLsp(context)
              })
              return lspCompletionListToMonaco(result, model, position)
            } catch {
              return { suggestions: [] }
            }
          },
          resolveCompletionItem: this.capabilities.completionProvider.resolveProvider
            ? async (item) => {
                if (!this.connection) return item
                const original = (item as { _lspItem?: unknown })._lspItem
                if (!original) return item
                try {
                  const resolved = await this.connection.sendRequest(
                    'completionItem/resolve',
                    original
                  )
                  const itemRange = item.range
                  const fallbackRange: monaco.IRange =
                    'startLineNumber' in itemRange ? itemRange : itemRange.replace
                  return lspCompletionItemToMonaco(resolved, fallbackRange)
                } catch {
                  return item
                }
              }
            : undefined
        })
      )
    }

    if (features.signatureHelp && this.capabilities.signatureHelpProvider) {
      const triggerCharacters = this.capabilities.signatureHelpProvider.triggerCharacters ?? [
        '(',
        ','
      ]
      this.monacoDisposables.push(
        monaco.languages.registerSignatureHelpProvider(selector, {
          signatureHelpTriggerCharacters: triggerCharacters,
          signatureHelpRetriggerCharacters: [','],
          provideSignatureHelp: async (model, position, _token, context) => {
            if (!this.connection) return null
            try {
              const result = await this.connection.sendRequest('textDocument/signatureHelp', {
                textDocument: { uri: model.uri.toString() },
                position: monacoPositionToLsp(position),
                context: monacoSignatureContextToLsp(context)
              })
              const help = lspSignatureHelpToMonaco(result)
              if (!help) return null
              return { value: help, dispose: () => undefined }
            } catch {
              return null
            }
          }
        })
      )
    }

    if (features.definition && this.capabilities.definitionProvider) {
      this.monacoDisposables.push(
        monaco.languages.registerDefinitionProvider(selector, {
          provideDefinition: async (model, position) => {
            if (!this.connection) return null
            try {
              const result = await this.connection.sendRequest('textDocument/definition', {
                textDocument: { uri: model.uri.toString() },
                position: monacoPositionToLsp(position)
              })
              return lspLocationsToMonaco(result)
            } catch {
              return null
            }
          }
        })
      )
    }

    if (features.references && this.capabilities.referencesProvider) {
      this.monacoDisposables.push(
        monaco.languages.registerReferenceProvider(selector, {
          provideReferences: async (model, position, context) => {
            if (!this.connection) return null
            try {
              const result = await this.connection.sendRequest('textDocument/references', {
                textDocument: { uri: model.uri.toString() },
                position: monacoPositionToLsp(position),
                context: { includeDeclaration: context.includeDeclaration ?? true }
              })
              return lspLocationsToMonaco(result)
            } catch {
              return null
            }
          }
        })
      )
    }

    if (features.rename && this.capabilities.renameProvider) {
      this.monacoDisposables.push(
        monaco.languages.registerRenameProvider(selector, {
          provideRenameEdits: async (model, position, newName) => {
            if (!this.connection) return null
            try {
              const result = await this.connection.sendRequest('textDocument/rename', {
                textDocument: { uri: model.uri.toString() },
                position: monacoPositionToLsp(position),
                newName
              })
              return lspWorkspaceEditToMonaco(result)
            } catch {
              return null
            }
          }
        })
      )
    }

    if (features.formatting && this.capabilities.documentFormattingProvider) {
      this.monacoDisposables.push(
        monaco.languages.registerDocumentFormattingEditProvider(selector, {
          provideDocumentFormattingEdits: async (model, options) => {
            if (!this.connection) return null
            try {
              const result = await this.connection.sendRequest('textDocument/formatting', {
                textDocument: { uri: model.uri.toString() },
                options: monacoFormattingOptionsToLsp(options)
              })
              return lspTextEditsToMonaco(result)
            } catch {
              return null
            }
          }
        })
      )
    }

    void TextDocumentSyncKind
  }
}

export class LanguageClientsManager {
  private clients = new Map<string, LanguageClientHost>()
  private workspaceRoot: string | undefined

  async startAll(configs: LanguageClientConfig[], workspaceRoot: string | undefined): Promise<void> {
    this.workspaceRoot = workspaceRoot
    await Promise.all(
      configs.map(async (config) => {
        if (this.clients.has(config.id)) return
        const host = new LanguageClientHost(config, workspaceRoot)
        try {
          await host.start()
          this.clients.set(config.id, host)
        } catch (error) {
          console.warn(`[lsp:${config.id}] failed to start`, error)
        }
      })
    )
  }

  stopAll(): void {
    for (const client of this.clients.values()) client.stop()
    this.clients.clear()
  }

  async restartAll(workspaceRoot: string | undefined): Promise<void> {
    this.workspaceRoot = workspaceRoot
    const restarts = Array.from(this.clients.values()).map((client) => client.restart(workspaceRoot))
    await Promise.all(restarts)
  }

  has(id: string): boolean {
    return this.clients.has(id)
  }

  size(): number {
    return this.clients.size
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot
  }
}
