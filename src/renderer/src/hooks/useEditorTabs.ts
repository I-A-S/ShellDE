/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { ConfirmDialogState, Tab } from '../types'
import { getLanguage, resolveActiveTabPath } from '../utils/editor'

type UseEditorTabsParams = {
  tabs: Tab[]
  activeTabPath: string | null
  setTabs: Dispatch<SetStateAction<Tab[]>>
  setActiveTabPath: Dispatch<SetStateAction<string | null>>
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>
  setErrorMessage: Dispatch<SetStateAction<string | null>>
  monacoEditorRef: MutableRefObject<MonacoEditor.IStandaloneCodeEditor | null>
}

type UseEditorTabsResult = {
  handleSaveCurrent: () => Promise<void>
  handleSaveAll: () => Promise<void>
  handleCloseTab: (event: MouseEvent, pathToClose: string) => void
  handleEditorChange: (value: string | undefined) => void
}

export function useEditorTabs({
  tabs,
  activeTabPath,
  setTabs,
  setActiveTabPath,
  setConfirmDialog,
  setErrorMessage,
  monacoEditorRef
}: UseEditorTabsParams): UseEditorTabsResult {
  const formatActiveEditorIfPython = async (tab: Tab): Promise<string | null> => {
    const editor = monacoEditorRef.current
    if (!editor) return null
    const model = editor.getModel()
    if (!model) return null
    if (model.uri.fsPath !== tab.path) return null
    if (getLanguage(tab.name) !== 'python') return null
    const action = editor.getAction('editor.action.formatDocument')
    if (!action) return null
    try {
      await action.run()
      return model.getValue()
    } catch {
      return null
    }
  }

  const saveTab = async (tab: Tab) => {
    const formatted = await formatActiveEditorIfPython(tab)
    const finalContent = formatted ?? tab.content
    await window.api.writeFile(tab.path, finalContent)
    setTabs((prev) =>
      prev.map((item) =>
        item.path === tab.path
          ? { ...item, content: finalContent, savedContent: finalContent }
          : item
      )
    )
  }

  const handleSaveCurrent = async () => {
    const resolvedActiveTabPath = resolveActiveTabPath(tabs, activeTabPath)
    if (!resolvedActiveTabPath) return
    const active = tabs.find((tab) => tab.path === resolvedActiveTabPath)
    if (!active) return
    try {
      await saveTab(active)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save file')
    }
  }

  const handleSaveAll = async () => {
    try {
      await Promise.all(tabs.map((tab) => saveTab(tab)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save all files')
    }
  }

  const closeTabByPath = (pathToClose: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((tab) => tab.path !== pathToClose)
      if (activeTabPath === pathToClose) {
        setActiveTabPath(newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null)
      }
      return newTabs
    })
  }

  const handleCloseTab = (event: MouseEvent, pathToClose: string) => {
    event.stopPropagation()
    const tabToClose = tabs.find((tab) => tab.path === pathToClose)
    if (!tabToClose) return
    const isDirty = tabToClose.content !== tabToClose.savedContent
    if (!isDirty) {
      closeTabByPath(pathToClose)
      return
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Unsaved Changes',
      message: `Close "${tabToClose.name}" without saving? Unsaved changes will be lost.`,
      cancelLabel: 'No',
      confirmLabel: 'Close Without Saving',
      defaultAction: 'cancel',
      onConfirm: async () => {
        closeTabByPath(pathToClose)
      }
    })
  }

  const handleEditorChange = (value: string | undefined) => {
    const resolvedActiveTabPath = resolveActiveTabPath(tabs, activeTabPath)
    if (!resolvedActiveTabPath || value === undefined) return
    setTabs((prev) =>
      prev.map((tab) => (tab.path === resolvedActiveTabPath ? { ...tab, content: value } : tab))
    )
  }

  return { handleSaveCurrent, handleSaveAll, handleCloseTab, handleEditorChange }
}
