/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect, type MutableRefObject } from 'react'
import * as monaco from 'monaco-editor'
import type { editor as MonacoEditor } from 'monaco-editor'

type UseAppShortcutsParams = {
  monacoEditorRef: MutableRefObject<MonacoEditor.IStandaloneCodeEditor | null>
  handleSaveCurrent: () => Promise<void>
  handleSaveAll: () => Promise<void>
  runWorkspaceAction: (action: 'rename' | 'delete' | 'copy' | 'cut' | 'paste') => Promise<boolean>
  leftPaneTab: 'workspace' | 'search'
  nameDialogOpen: boolean
  confirmDialogOpen: boolean
  appendOutputLine: (message: string) => void
}

export function useAppShortcuts({
  monacoEditorRef,
  handleSaveCurrent,
  handleSaveAll,
  runWorkspaceAction,
  leftPaneTab,
  nameDialogOpen,
  confirmDialogOpen,
  appendOutputLine
}: UseAppShortcutsParams) {
  const hasEditorSelection = () => {
    const editor = monacoEditorRef.current
    if (!editor) return false
    const selection = editor.getSelection()
    return selection ? !selection.isEmpty() : false
  }

  const copyCurrentLine = async () => {
    const editor = monacoEditorRef.current
    const model = editor?.getModel()
    const position = editor?.getPosition()
    if (!editor || !model || !position) return false
    const lineText = model.getLineContent(position.lineNumber)
    await navigator.clipboard.writeText(`${lineText}\n`)
    return true
  }

  const cutCurrentLine = async () => {
    const editor = monacoEditorRef.current
    const model = editor?.getModel()
    const position = editor?.getPosition()
    if (!editor || !model || !position) return false

    const lineNumber = position.lineNumber
    const lineMaxColumn = model.getLineMaxColumn(lineNumber)
    const hasNextLine = lineNumber < model.getLineCount()
    const endLineNumber = hasNextLine ? lineNumber + 1 : lineNumber
    const endColumn = hasNextLine ? 1 : lineMaxColumn
    const lineText = model.getLineContent(lineNumber)

    await navigator.clipboard.writeText(`${lineText}\n`)
    editor.executeEdits('line-cut', [
      {
        range: new monaco.Range(lineNumber, 1, endLineNumber, endColumn),
        text: ''
      }
    ])
    editor.setPosition({ lineNumber: Math.min(lineNumber, model.getLineCount()), column: 1 })
    return true
  }

  const pasteOverCurrentLine = async () => {
    const editor = monacoEditorRef.current
    const model = editor?.getModel()
    const position = editor?.getPosition()
    if (!editor || !model || !position) return false

    const clipboardText = await navigator.clipboard.readText()
    if (!clipboardText) return true
    const lineNumber = position.lineNumber
    const lineMaxColumn = model.getLineMaxColumn(lineNumber)
    editor.executeEdits('line-paste', [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, lineMaxColumn),
        text: clipboardText.replace(/\r\n/g, '\n').replace(/\n$/, '')
      }
    ])
    return true
  }

  const runEditorAction = async (actionId: string) => {
    const action = monacoEditorRef.current?.getAction(actionId)
    if (!action) return false
    await action.run()
    return true
  }

  const handleEditorShortcut = useCallback(async (event: KeyboardEvent) => {
    const editor = monacoEditorRef.current
    if (!editor || !editor.hasTextFocus()) return false

    const withCmd = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    const hasSelection = hasEditorSelection()

    if (withCmd && key === 'c') {
      event.preventDefault()
      if (hasSelection) await runEditorAction('editor.action.clipboardCopyAction')
      else await copyCurrentLine()
      return true
    }

    if (withCmd && key === 'x') {
      event.preventDefault()
      if (hasSelection) await runEditorAction('editor.action.clipboardCutAction')
      else await cutCurrentLine()
      return true
    }

    if (withCmd && key === 'v') {
      event.preventDefault()
      if (hasSelection) await runEditorAction('editor.action.clipboardPasteAction')
      else await pasteOverCurrentLine()
      return true
    }

    if (withCmd && key === 'd') {
      event.preventDefault()
      await runEditorAction('editor.action.copyLinesDownAction')
      return true
    }

    if (event.altKey && event.shiftKey && key === 'l') {
      event.preventDefault()
      const formatted = await runEditorAction('editor.action.formatDocument')
      if (!formatted) {
        const editorLanguage = monacoEditorRef.current?.getModel()?.getLanguageId() ?? 'unknown'
        appendOutputLine(`Format unavailable for language: ${editorLanguage}`)
      }
      return true
    }

    return false
  }, [appendOutputLine, monacoEditorRef])

  useEffect(() => {
    window.api.onMenuSaveCurrent(() => {
      void handleSaveCurrent()
    })
    window.api.onMenuSaveAll(() => {
      void handleSaveAll()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSaveCurrent, handleSaveAll])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      void handleEditorShortcut(event).then((handledByEditor) => {
        if (handledByEditor) return

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          void handleSaveCurrent()
          return
        }

        const target = event.target as HTMLElement | null
        if (
          target &&
          (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        )
          return
        if (nameDialogOpen || confirmDialogOpen || leftPaneTab !== 'workspace') return

        if (event.key === 'Delete') {
          event.preventDefault()
          void runWorkspaceAction('delete')
          return
        }

        if (event.key === 'F2') {
          event.preventDefault()
          void runWorkspaceAction('rename')
          return
        }

        if (!event.ctrlKey && !event.metaKey) return
        const key = event.key.toLowerCase()
        if (key === 'c') {
          event.preventDefault()
          void runWorkspaceAction('copy')
        } else if (key === 'x') {
          event.preventDefault()
          void runWorkspaceAction('cut')
        } else if (key === 'v') {
          event.preventDefault()
          void runWorkspaceAction('paste')
        }
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleSaveCurrent,
    runWorkspaceAction,
    leftPaneTab,
    nameDialogOpen,
    confirmDialogOpen,
    handleEditorShortcut
  ])
}
