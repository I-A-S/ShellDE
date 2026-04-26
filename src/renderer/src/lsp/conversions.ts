import * as monaco from 'monaco-editor'

type LspPosition = { line: number; character: number }
type LspRange = { start: LspPosition; end: LspPosition }
type LspTextEdit = { range: LspRange; newText: string }
type LspMarkupContent = { kind: 'markdown' | 'plaintext'; value: string }

export const uriFromPath = (filePath: string): string => monaco.Uri.file(filePath).toString()

export const pathFromUri = (uri: string): string | null => {
  try {
    return monaco.Uri.parse(uri).fsPath
  } catch {
    return null
  }
}

export const monacoPositionToLsp = (position: monaco.IPosition): LspPosition => ({
  line: position.lineNumber - 1,
  character: position.column - 1
})

export const lspPositionToMonaco = (position: LspPosition): monaco.IPosition => ({
  lineNumber: position.line + 1,
  column: position.character + 1
})

export const lspRangeToMonaco = (range: LspRange): monaco.IRange => ({
  startLineNumber: range.start.line + 1,
  startColumn: range.start.character + 1,
  endLineNumber: range.end.line + 1,
  endColumn: range.end.character + 1
})

const lspSeverityToMonaco = (severity: number | undefined): monaco.MarkerSeverity => {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error
    case 2:
      return monaco.MarkerSeverity.Warning
    case 3:
      return monaco.MarkerSeverity.Info
    case 4:
      return monaco.MarkerSeverity.Hint
    default:
      return monaco.MarkerSeverity.Error
  }
}

export const lspDiagnosticsToMarkers = (
  diagnostics: unknown[]
): monaco.editor.IMarkerData[] => {
  return (diagnostics as Array<Record<string, unknown>>).map((diagnostic) => {
    const range = (diagnostic.range as LspRange) ?? {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 }
    }
    const monacoRange = lspRangeToMonaco(range)
    const code = diagnostic.code
    const codeString = typeof code === 'string' || typeof code === 'number' ? String(code) : undefined
    return {
      severity: lspSeverityToMonaco(diagnostic.severity as number | undefined),
      message: typeof diagnostic.message === 'string' ? diagnostic.message : '',
      source: typeof diagnostic.source === 'string' ? diagnostic.source : undefined,
      code: codeString,
      startLineNumber: monacoRange.startLineNumber,
      startColumn: monacoRange.startColumn,
      endLineNumber: monacoRange.endLineNumber,
      endColumn: monacoRange.endColumn
    }
  })
}

const markupToMonacoMarkdown = (
  content: string | LspMarkupContent | unknown
): monaco.IMarkdownString | null => {
  if (!content) return null
  if (typeof content === 'string') return { value: content }
  if (typeof content === 'object' && content !== null && 'value' in content) {
    const v = content as LspMarkupContent
    return { value: v.value, isTrusted: false, supportHtml: false }
  }
  return null
}

export const lspHoverToMonaco = (result: unknown): monaco.languages.Hover | null => {
  if (!result) return null
  const value = result as { contents?: unknown; range?: LspRange }
  const contents: monaco.IMarkdownString[] = []
  if (Array.isArray(value.contents)) {
    for (const entry of value.contents) {
      const md = markupToMonacoMarkdown(entry)
      if (md) contents.push(md)
    }
  } else {
    const md = markupToMonacoMarkdown(value.contents)
    if (md) contents.push(md)
  }
  if (contents.length === 0) return null
  return {
    contents,
    range: value.range ? lspRangeToMonaco(value.range) : undefined
  }
}

const lspCompletionKindToMonaco = (kind: number | undefined): monaco.languages.CompletionItemKind => {
  const map: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter
  }
  return kind && map[kind] ? map[kind] : monaco.languages.CompletionItemKind.Text
}

export const monacoCompletionContextToLsp = (
  context: monaco.languages.CompletionContext
): { triggerKind: number; triggerCharacter?: string } => {
  let triggerKind = 1
  if (context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter) {
    triggerKind = 2
  } else if (
    context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions
  ) {
    triggerKind = 3
  }
  return {
    triggerKind,
    triggerCharacter: context.triggerCharacter
  }
}

const wordRangeAtPosition = (
  model: monaco.editor.ITextModel,
  position: monaco.IPosition
): monaco.IRange => {
  const word = model.getWordUntilPosition(position)
  return {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column
  }
}

type LspCompletionItem = {
  label: string | { label: string; detail?: string; description?: string }
  kind?: number
  detail?: string
  documentation?: string | LspMarkupContent
  sortText?: string
  filterText?: string
  preselect?: boolean
  insertText?: string
  insertTextFormat?: number
  textEdit?: { range?: LspRange; insert?: LspRange; replace?: LspRange; newText: string }
  additionalTextEdits?: LspTextEdit[]
  command?: { title: string; command: string; arguments?: unknown[] }
  data?: unknown
}

export const lspCompletionItemToMonaco = (
  item: unknown,
  fallbackRange: monaco.IRange
): monaco.languages.CompletionItem & { _lspItem: unknown } => {
  const lspItem = item as LspCompletionItem
  const labelObj =
    typeof lspItem.label === 'string'
      ? { label: lspItem.label }
      : { label: lspItem.label.label, detail: lspItem.label.detail }
  const insertTextRaw =
    typeof lspItem.insertText === 'string' && lspItem.insertText.length > 0
      ? lspItem.insertText
      : labelObj.label
  const isSnippet = lspItem.insertTextFormat === 2
  let range: monaco.IRange | { insert: monaco.IRange; replace: monaco.IRange } = fallbackRange
  let insertText = insertTextRaw
  if (lspItem.textEdit) {
    const te = lspItem.textEdit
    insertText = te.newText
    if (te.insert && te.replace) {
      range = {
        insert: lspRangeToMonaco(te.insert),
        replace: lspRangeToMonaco(te.replace)
      }
    } else if (te.range) {
      range = lspRangeToMonaco(te.range)
    }
  }
  const documentation = lspItem.documentation
    ? typeof lspItem.documentation === 'string'
      ? { value: lspItem.documentation }
      : { value: lspItem.documentation.value }
    : undefined
  const additionalTextEdits = lspItem.additionalTextEdits
    ? lspItem.additionalTextEdits.map((edit) => ({
        range: lspRangeToMonaco(edit.range),
        text: edit.newText
      }))
    : undefined

  return {
    label: labelObj.label,
    kind: lspCompletionKindToMonaco(lspItem.kind),
    detail: lspItem.detail,
    documentation,
    insertText,
    insertTextRules: isSnippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    range,
    sortText: lspItem.sortText,
    filterText: lspItem.filterText,
    preselect: lspItem.preselect,
    additionalTextEdits,
    _lspItem: item
  }
}

export const lspCompletionListToMonaco = (
  result: unknown,
  model: monaco.editor.ITextModel,
  position: monaco.IPosition
): monaco.languages.CompletionList => {
  if (!result) return { suggestions: [] }
  const items: unknown[] = Array.isArray(result)
    ? result
    : ((result as { items?: unknown[] }).items ?? [])
  const incomplete = !Array.isArray(result) && Boolean((result as { isIncomplete?: boolean }).isIncomplete)
  const fallbackRange = wordRangeAtPosition(model, position)
  return {
    suggestions: items.map((item) => lspCompletionItemToMonaco(item, fallbackRange)),
    incomplete
  }
}

export const monacoSignatureContextToLsp = (
  context: monaco.languages.SignatureHelpContext
): { triggerKind: number; triggerCharacter?: string; isRetrigger: boolean } => {
  let triggerKind = 1
  if (context.triggerKind === monaco.languages.SignatureHelpTriggerKind.TriggerCharacter) {
    triggerKind = 2
  } else if (context.triggerKind === monaco.languages.SignatureHelpTriggerKind.ContentChange) {
    triggerKind = 3
  }
  return {
    triggerKind,
    triggerCharacter: context.triggerCharacter,
    isRetrigger: context.isRetrigger
  }
}

type LspSignature = {
  label: string
  documentation?: string | LspMarkupContent
  parameters?: Array<{ label: string | [number, number]; documentation?: string | LspMarkupContent }>
  activeParameter?: number
}

type LspSignatureHelp = {
  signatures: LspSignature[]
  activeSignature?: number
  activeParameter?: number
}

export const lspSignatureHelpToMonaco = (
  result: unknown
): monaco.languages.SignatureHelp | null => {
  if (!result) return null
  const value = result as LspSignatureHelp
  if (!value.signatures || value.signatures.length === 0) return null
  return {
    signatures: value.signatures.map((sig) => ({
      label: sig.label,
      documentation: sig.documentation
        ? typeof sig.documentation === 'string'
          ? sig.documentation
          : { value: sig.documentation.value }
        : undefined,
      parameters: (sig.parameters ?? []).map((param) => ({
        label: param.label,
        documentation: param.documentation
          ? typeof param.documentation === 'string'
            ? param.documentation
            : { value: param.documentation.value }
          : undefined
      })),
      activeParameter: sig.activeParameter
    })),
    activeSignature: value.activeSignature ?? 0,
    activeParameter: value.activeParameter ?? 0
  }
}

type LspLocation = { uri: string; range: LspRange }
type LspLocationLink = {
  targetUri: string
  targetRange: LspRange
  targetSelectionRange?: LspRange
}

export const lspLocationsToMonaco = (result: unknown): monaco.languages.Location[] => {
  if (!result) return []
  const arr = Array.isArray(result) ? result : [result]
  const out: monaco.languages.Location[] = []
  for (const entry of arr) {
    if (!entry) continue
    if ('targetUri' in (entry as object)) {
      const link = entry as LspLocationLink
      out.push({
        uri: monaco.Uri.parse(link.targetUri),
        range: lspRangeToMonaco(link.targetSelectionRange ?? link.targetRange)
      })
      continue
    }
    const loc = entry as LspLocation
    if (!loc.uri || !loc.range) continue
    out.push({
      uri: monaco.Uri.parse(loc.uri),
      range: lspRangeToMonaco(loc.range)
    })
  }
  return out
}

export const monacoFormattingOptionsToLsp = (
  options: monaco.languages.FormattingOptions
): { tabSize: number; insertSpaces: boolean } => ({
  tabSize: options.tabSize,
  insertSpaces: options.insertSpaces
})

export const lspTextEditsToMonaco = (
  result: unknown
): monaco.languages.TextEdit[] => {
  if (!result || !Array.isArray(result)) return []
  return (result as LspTextEdit[]).map((edit) => ({
    range: lspRangeToMonaco(edit.range),
    text: edit.newText
  }))
}

type LspWorkspaceEdit = {
  changes?: Record<string, LspTextEdit[]>
  documentChanges?: Array<{
    textDocument?: { uri: string; version?: number | null }
    edits?: LspTextEdit[]
    kind?: string
  }>
}

export const lspWorkspaceEditToMonaco = (
  result: unknown
): monaco.languages.WorkspaceEdit | null => {
  if (!result) return null
  const value = result as LspWorkspaceEdit
  const edits: monaco.languages.IWorkspaceTextEdit[] = []
  if (value.changes) {
    for (const [uri, fileEdits] of Object.entries(value.changes)) {
      for (const edit of fileEdits) {
        edits.push({
          resource: monaco.Uri.parse(uri),
          versionId: undefined,
          textEdit: { range: lspRangeToMonaco(edit.range), text: edit.newText }
        })
      }
    }
  }
  if (value.documentChanges) {
    for (const change of value.documentChanges) {
      if (!change.textDocument || !change.edits) continue
      const resource = monaco.Uri.parse(change.textDocument.uri)
      const versionId =
        typeof change.textDocument.version === 'number' ? change.textDocument.version : undefined
      for (const edit of change.edits) {
        edits.push({
          resource,
          versionId,
          textEdit: { range: lspRangeToMonaco(edit.range), text: edit.newText }
        })
      }
    }
  }
  return { edits }
}
