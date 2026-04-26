/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useRef, useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import appIcon from './assets/icon.svg'
import type { editor as MonacoEditor } from 'monaco-editor'
import { LeftPane } from './components/LeftPane'
import { TerminalPanel } from './components/TerminalPanel'
import { ContextMenu } from './components/ContextMenu'
import { NameDialog } from './components/NameDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ErrorToast } from './components/ErrorToast'
import { FooterBar } from './components/FooterBar'
import { LanguageClientsManager } from './lsp/client'
import { getBuiltInLspClientConfigs, registerBuiltInLanguages } from './lsp/registry'
import type {
  ConfirmDialogState,
  ContextMenuState,
  NameDialogState,
  SearchResult,
  SelectedNode,
  Tab,
  TermTab,
  TreeNode
} from './types'

loader.config({ monaco })
registerBuiltInLanguages()

type NameDialogMode = 'create-file' | 'create-folder' | 'rename'

function App() {
  const [fileTree, setFileTree] = useState<TreeNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [clipboard, setClipboard] = useState<{ sourcePath: string; cut: boolean } | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialogState>({
    isOpen: false,
    mode: 'create-file',
    title: '',
    value: '',
    placeholder: ''
  })
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    defaultAction: 'cancel',
    onConfirm: null
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [leftPaneTab, setLeftPaneTab] = useState<'workspace' | 'search'>('workspace')
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorColumn, setCursorColumn] = useState(1)
  const [isTopMenuExpanded, setIsTopMenuExpanded] = useState(false)
  const [leftPaneWidth, setLeftPaneWidth] = useState(280)
  const [terminalHeight, setTerminalHeight] = useState(260)

  const [termTabs, setTermTabs] = useState<TermTab[]>([
    { id: 'output', title: 'Output', closable: false }
  ])
  const [activeTermId, setActiveTermId] = useState<string | null>('output')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const xtermInstances = useRef<Record<string, { term: Terminal; fit: FitAddon }>>({})
  const initializedTerminalRef = useRef(false)
  const centerPaneRef = useRef<HTMLDivElement | null>(null)
  const lspManagerRef = useRef<LanguageClientsManager | null>(null)
  const monacoEditorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    window.api.isWindowMaximized().then(setIsWindowMaximized)
    const onResize = () => {
      window.api.isWindowMaximized().then(setIsWindowMaximized)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    window.api.onMenuOpenWorkspace(() => {
      void handleOpenWorkspace()
    })
    window.api.onMenuCloseWorkspace(() => {
      void handleCloseWorkspace()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.api.onMenuOpenSearch(() => {
      setLeftPaneTab('search')
    })
  }, [])

  useEffect(() => {
    window.api.getLastWorkspace().then(async (workspacePath) => {
      if (!workspacePath) return
      const tree = await window.api.readDirTree(workspacePath)
      setFileTree(tree)
      setSelectedNode(null)
    })
  }, [])

  useEffect(() => {
    if (!fileTree?.path) return
    for (const terminal of termTabs.filter((item) => item.id !== 'output')) {
      window.api.writeTerminal(terminal.id, `cd "${fileTree.path}"\r`)
    }
  }, [fileTree?.path, termTabs])

  useEffect(() => {
    if (!lspManagerRef.current) {
      lspManagerRef.current = new LanguageClientsManager()
    }
    const manager = lspManagerRef.current
    let cancelled = false

    const configs = getBuiltInLspClientConfigs()
    manager.stopAll()

    if (fileTree?.path) {
      void manager.startAll(configs, fileTree.path).then(() => {
        if (cancelled) manager.stopAll()
      })
    }

    return () => {
      cancelled = true
    }
  }, [fileTree?.path])

  useEffect(() => {
    return () => {
      lspManagerRef.current?.stopAll()
      lspManagerRef.current = null
    }
  }, [])

  useEffect(() => {
    window.api.onTerminalOutput((data: string) => {
      setOutputLines((prev) => [...prev.slice(-500), data])
      if (xtermInstances.current.output) {
        xtermInstances.current.output.term.write(data)
      }
    })
  }, [])

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setNameDialog((prev) => ({ ...prev, isOpen: false }))
        setConfirmDialog((prev) => ({ ...prev, isOpen: false, onConfirm: null }))
      }
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', onEscape)
    }
  }, [])

  const createTerminal = async (cwd?: string) => {
    if (termTabs.some((tab) => tab.id !== 'output' && tab.title === 'Starting...')) return
    const id = `term-${Date.now()}`
    const shellName = await window.api.spawnTerminal(id, cwd)
    setTermTabs((prev) => [...prev, { id, title: shellName, closable: true }])
    setActiveTermId(id)
  }

  useEffect(() => {
    if (!initializedTerminalRef.current) {
      initializedTerminalRef.current = true
      void createTerminal(fileTree?.path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    termTabs.forEach((tab) => {
      if (!xtermInstances.current[tab.id]) {
        const termNode = document.getElementById(`xterm-host-${tab.id}`)
        if (termNode) {
          const term = new Terminal({
            theme: { background: '#1e1e1e' },
            fontFamily: 'monospace',
            cursorBlink: tab.id !== 'output',
            disableStdin: tab.id === 'output'
          })
          const fitAddon = new FitAddon()
          term.loadAddon(fitAddon)
          term.open(termNode)
          fitAddon.fit()

          if (tab.id === 'output') {
            term.write(outputLines.join('') || 'Output panel ready.\r\n')
          } else {
            term.onData((data) => {
              window.api.writeTerminal(tab.id, data)
            })

            window.api.onTerminalData(tab.id, (data: string) => {
              term.write(data)
            })

            term.onResize((size) => {
              window.api.resizeTerminal(tab.id, size.cols, size.rows)
            })
          }

          xtermInstances.current[tab.id] = { term, fit: fitAddon }
        }
      }
    })
  }, [termTabs, outputLines])

  useEffect(() => {
    if (activeTermId && xtermInstances.current[activeTermId]) {
      setTimeout(() => xtermInstances.current[activeTermId].fit.fit(), 50)
    }

    const handleResize = () => {
      if (activeTermId && xtermInstances.current[activeTermId]) {
        xtermInstances.current[activeTermId].fit.fit()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTermId])

  useEffect(() => {
    if (!activeTermId || !xtermInstances.current[activeTermId]) return
    setTimeout(() => xtermInstances.current[activeTermId].fit.fit(), 0)
  }, [activeTermId, terminalHeight])

  const closeTerminal = (e: MouseEvent, idToClose: string) => {
    e.stopPropagation()
    window.api.killTerminal(idToClose)
    delete xtermInstances.current[idToClose]

    setTermTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== idToClose)
      if (activeTermId === idToClose) {
        setActiveTermId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      }
      return newTabs
    })
  }

  const refreshWorkspace = async () => {
    if (!fileTree?.path) return
    const tree = await window.api.readDirTree(fileTree.path)
    setFileTree(tree)
  }

  async function handleOpenWorkspace(): Promise<void> {
    const tree = await window.api.openFolder()
    if (tree) {
      setFileTree(tree)
      setSelectedNode(null)
      await window.api.setLastWorkspace(tree.path)
      for (const terminal of termTabs.filter((item) => item.id !== 'output')) {
        window.api.writeTerminal(terminal.id, `cd "${tree.path}"\r`)
      }
    }
  }

  async function handleCloseWorkspace(): Promise<void> {
    setFileTree(null)
    setSelectedNode(null)
    setSearchResults([])
    await window.api.setLastWorkspace(null)
  }

  const handleFileClick = async (filePath: string, fileName: string) => {
    if (tabs.find((t) => t.path === filePath)) {
      setActiveTabPath(filePath)
      return
    }
    const content = await window.api.readFile(filePath)
    setTabs((prev) => [...prev, { path: filePath, name: fileName, content, savedContent: content }])
    setActiveTabPath(filePath)
  }

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
    const resolvedActiveTabPath =
      activeTabPath && tabs.some((tab) => tab.path === activeTabPath)
        ? activeTabPath
        : tabs.length > 0
          ? tabs[tabs.length - 1].path
          : null
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
      const newTabs = prev.filter((t) => t.path !== pathToClose)
      if (activeTabPath === pathToClose) {
        setActiveTabPath(newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null)
      }
      return newTabs
    })
  }

  const handleCloseTab = (e: MouseEvent, pathToClose: string) => {
    e.stopPropagation()
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
    const resolvedActiveTabPath =
      activeTabPath && tabs.some((tab) => tab.path === activeTabPath)
        ? activeTabPath
        : tabs.length > 0
          ? tabs[tabs.length - 1].path
          : null
    if (!resolvedActiveTabPath || value === undefined) return
    setTabs((prev) =>
      prev.map((t) => (t.path === resolvedActiveTabPath ? { ...t, content: value } : t))
    )
  }

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

  const appendOutputLine = (message: string) => {
    setOutputLines((prev) => [...prev.slice(-500), `${message}\n`])
  }

  const handleEditorShortcut = async (event: KeyboardEvent) => {
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
  }

  useEffect(() => {
    window.api.onMenuSaveCurrent(() => {
      void handleSaveCurrent()
    })
    window.api.onMenuSaveAll(() => {
      void handleSaveAll()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabPath])

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
        if (nameDialog.isOpen || confirmDialog.isOpen || leftPaneTab !== 'workspace') return

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tabs,
    activeTabPath,
    leftPaneTab,
    selectedNode,
    clipboard,
    fileTree?.path,
    nameDialog.isOpen,
    confirmDialog.isOpen
  ])

  const withFsAction = async (action: () => Promise<void>) => {
    try {
      await action()
      await refreshWorkspace()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'File operation failed')
    }
  }

  const getTargetDirectory = () => {
    if (!fileTree) return null
    if (!selectedNode) return fileTree.path
    return selectedNode.node.isDirectory ? selectedNode.node.path : selectedNode.parentPath
  }

  const openNameDialog = (mode: NameDialogMode, initialValue = '') => {
    const config: Record<NameDialogMode, { title: string; placeholder: string }> = {
      'create-file': { title: 'Create New File', placeholder: 'example.txt' },
      'create-folder': { title: 'Create New Folder', placeholder: 'folder-name' },
      rename: { title: 'Rename', placeholder: 'new-name' }
    }
    setNameDialog({
      isOpen: true,
      mode,
      title: config[mode].title,
      value: initialValue,
      placeholder: config[mode].placeholder
    })
  }

  const handleCreateFile = () => {
    openNameDialog('create-file')
  }

  const handleCreateFolder = () => {
    openNameDialog('create-folder')
  }

  const submitNameDialog = async () => {
    const name = nameDialog.value.trim()
    if (!name) {
      setNameDialog((prev) => ({ ...prev, isOpen: false }))
      return
    }

    const mode = nameDialog.mode
    setNameDialog((prev) => ({ ...prev, isOpen: false }))

    if (mode === 'create-file') {
      const dir = getTargetDirectory()
      if (!dir) return
      await withFsAction(async () => {
        await window.api.createFile(dir, name)
      })
      return
    }

    if (mode === 'create-folder') {
      const dir = getTargetDirectory()
      if (!dir) return
      await withFsAction(async () => {
        await window.api.createFolder(dir, name)
      })
      return
    }

    if (!selectedNode || name === selectedNode.node.name) return
    await withFsAction(async () => {
      await window.api.renamePath(selectedNode.node.path, name)
      if (activeTabPath === selectedNode.node.path) {
        const newPath = selectedNode.node.path.replace(/[^\\/]+$/, name)
        setActiveTabPath(newPath)
      }
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.path !== selectedNode.node.path) return tab
          return { ...tab, name, path: tab.path.replace(/[^\\/]+$/, name) }
        })
      )
      setSelectedNode(null)
    })
  }

  const openContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    node: TreeNode | null,
    parentPath: string | null
  ) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node,
      parentPath
    })
  }

  const runContextAction = async (
    action: 'new-file' | 'new-folder' | 'rename' | 'delete' | 'copy' | 'cut' | 'paste' | 'refresh'
  ) => {
    const contextNode = contextMenu?.node ?? null
    const contextParent = contextMenu?.parentPath ?? null
    if (contextNode && contextParent) {
      setSelectedNode({ node: contextNode, parentPath: contextParent })
    } else {
      setSelectedNode(null)
    }
    setContextMenu(null)

    if (action === 'new-file') return openNameDialog('create-file')
    if (action === 'new-folder') return openNameDialog('create-folder')
    if (action === 'rename') {
      if (!contextNode) return
      return openNameDialog('rename', contextNode.name)
    }
    if (action === 'delete') {
      if (!contextNode) return
      setConfirmDialog({
        isOpen: true,
        title: 'Delete Item',
        message: `Delete "${contextNode.name}"?`,
        cancelLabel: 'Cancel',
        confirmLabel: 'Delete',
        defaultAction: 'cancel',
        onConfirm: async () => {
          await withFsAction(async () => {
            await window.api.deletePath(contextNode.path)
            setTabs((prev) => prev.filter((tab) => tab.path !== contextNode.path))
            if (activeTabPath === contextNode.path) setActiveTabPath(null)
            setSelectedNode(null)
          })
        }
      })
      return
    }
    if (action === 'copy') {
      if (!contextNode) return
      return setClipboard({ sourcePath: contextNode.path, cut: false })
    }
    if (action === 'cut') {
      if (!contextNode) return
      return setClipboard({ sourcePath: contextNode.path, cut: true })
    }
    if (action === 'paste') {
      const dir = contextNode
        ? contextNode.isDirectory
          ? contextNode.path
          : contextParent
        : fileTree?.path
      if (!dir || !clipboard) return
      await withFsAction(async () => {
        await window.api.pastePath(clipboard.sourcePath, dir, clipboard.cut)
        if (clipboard.cut) setClipboard(null)
      })
      return
    }
    if (action === 'refresh') return refreshWorkspace()
  }

  const runWorkspaceAction = async (
    action: 'rename' | 'delete' | 'copy' | 'cut' | 'paste'
  ): Promise<boolean> => {
    if (leftPaneTab !== 'workspace' || !fileTree) return false

    if (action === 'paste') {
      if (!clipboard) return false
      const dir = selectedNode
        ? selectedNode.node.isDirectory
          ? selectedNode.node.path
          : selectedNode.parentPath
        : fileTree.path
      await withFsAction(async () => {
        await window.api.pastePath(clipboard.sourcePath, dir, clipboard.cut)
        if (clipboard.cut) setClipboard(null)
      })
      return true
    }

    if (!selectedNode) return false

    if (action === 'rename') {
      openNameDialog('rename', selectedNode.node.name)
      return true
    }

    if (action === 'delete') {
      const node = selectedNode.node
      setConfirmDialog({
        isOpen: true,
        title: 'Delete Item',
        message: `Delete "${node.name}"?`,
        cancelLabel: 'Cancel',
        confirmLabel: 'Delete',
        defaultAction: 'cancel',
        onConfirm: async () => {
          await withFsAction(async () => {
            await window.api.deletePath(node.path)
            setTabs((prev) => prev.filter((tab) => tab.path !== node.path))
            if (activeTabPath === node.path) setActiveTabPath(null)
            setSelectedNode(null)
          })
        }
      })
      return true
    }

    if (action === 'copy') {
      setClipboard({ sourcePath: selectedNode.node.path, cut: false })
      return true
    }

    if (action === 'cut') {
      setClipboard({ sourcePath: selectedNode.node.path, cut: true })
      return true
    }

    return false
  }

  const handleBuild = () => {
    window.api.triggerBuild()
  }

  const handleTopMenu = (
    menuId: 'file' | 'edit' | 'selection' | 'view' | 'help',
    event: MouseEvent<HTMLButtonElement>
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    window.api.showAppMenu(menuId, Math.round(rect.left), Math.round(rect.bottom))
  }

  const actionButtons = [
    { icon: 'fa-folder-open-o', title: 'Open Workspace', apiCall: 'openWorkspace' },
    { icon: 'fa-gavel', title: 'Build (Mock)', apiCall: 'triggerBuild' }
  ] as const

  const actionButtonHandlers: Record<(typeof actionButtons)[number]['apiCall'], () => void> = {
    openWorkspace: () => {
      void handleOpenWorkspace()
    },
    triggerBuild: handleBuild
  }

  const startLeftPaneResize = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.min(520, Math.max(200, moveEvent.clientX))
      setLeftPaneWidth(nextWidth)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startTerminalResize = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = terminalHeight
    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const centerHeight =
        centerPaneRef.current?.getBoundingClientRect().height ?? window.innerHeight
      const deltaY = startY - moveEvent.clientY
      const nextHeight = Math.min(
        Math.max(160, startHeight + deltaY),
        Math.max(160, centerHeight - 180)
      )
      setTerminalHeight(nextHeight)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleMinimize = () => {
    window.api.minimizeWindow()
  }

  const handleToggleMaximize = async () => {
    window.api.toggleMaximizeWindow()
    const maximized = await window.api.isWindowMaximized()
    setIsWindowMaximized(maximized)
  }

  const handleClose = () => {
    window.api.closeWindow()
  }

  const getLanguage = (fileName: string) => {
    if (fileName.endsWith('.v') || fileName.endsWith('.sv')) return 'verilog'
    if (fileName.endsWith('.vhd') || fileName.endsWith('.vhdl')) return 'vhdl'
    if (fileName.endsWith('.py')) return 'python'
    if (fileName.endsWith('.json')) return 'json'
    return 'plaintext'
  }

  const resolvedActiveTabPath =
    activeTabPath && tabs.some((tab) => tab.path === activeTabPath)
      ? activeTabPath
      : tabs.length > 0
        ? tabs[tabs.length - 1].path
        : null
  const activeTab = tabs.find((t) => t.path === resolvedActiveTabPath)
  const hasContextNode = Boolean(contextMenu?.node)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)'
      }}
    >
      <div
        style={
          {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '36px',
            background: 'var(--color-titlebar)',
            borderBottom: '1px solid var(--color-border)',
            WebkitAppRegion: 'drag'
          } as CSSProperties
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '10px' }}>
          <img src={appIcon} alt="App Icon" style={{ width: '16px', height: '16px' }} />
          <button
            onClick={() => setIsTopMenuExpanded((prev) => !prev)}
            title="Menu"
            aria-label="Menu"
            style={
              {
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text)',
                fontSize: '14px',
                cursor: 'pointer',
                padding: '4px 8px',
                WebkitAppRegion: 'no-drag'
              } as CSSProperties
            }
          >
            <i className="fa fa-bars" />
          </button>
          {isTopMenuExpanded &&
            (['file', 'edit', 'selection', 'view', 'help'] as const).map((menuId) => (
              <button
                key={menuId}
                onClick={(event) => handleTopMenu(menuId, event)}
                style={
                  {
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    textTransform: 'capitalize',
                    WebkitAppRegion: 'no-drag'
                  } as CSSProperties
                }
              >
                {menuId}
              </button>
            ))}
        </div>
        <div
          style={
            { display: 'flex', alignItems: 'stretch', WebkitAppRegion: 'no-drag' } as CSSProperties
          }
        >
          <button
            onClick={handleMinimize}
            style={{
              width: '46px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text)',
              cursor: 'pointer'
            }}
          >
            <i className="fa fa-minus" style={{ fontSize: '13px' }} />
          </button>
          <button
            onClick={handleToggleMaximize}
            style={{
              width: '46px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text)',
              cursor: 'pointer'
            }}
          >
            {isWindowMaximized ? '❐' : '□'}
          </button>
          <button
            onClick={handleClose}
            style={{
              width: '46px',
              border: 'none',
              background: 'transparent',
              color: '#ddd',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ width: leftPaneWidth, minWidth: 0, flexShrink: 0 }}>
          <LeftPane
            fileTree={fileTree}
            leftPaneTab={leftPaneTab}
            selectedNode={selectedNode}
            searchQuery={searchQuery}
            replaceQuery={replaceQuery}
            searchResults={searchResults}
            onLeftPaneTabChange={setLeftPaneTab}
            onSearchQueryChange={setSearchQuery}
            onReplaceQueryChange={setReplaceQuery}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onOpenWorkspace={() => void handleOpenWorkspace()}
            onOpenSearchResult={(path) =>
              void handleFileClick(path, path.split(/[\\/]/).slice(-1)[0] || path)
            }
            onFind={() => {
              if (!fileTree || !searchQuery.trim()) return
              void window.api.findInFiles(fileTree.path, searchQuery).then(setSearchResults)
            }}
            onReplaceAll={() => {
              if (!fileTree || !searchQuery.trim()) return
              void window.api
                .replaceInFiles(fileTree.path, searchQuery, replaceQuery)
                .then(async (changed) => {
                  setOutputLines((prev) => [...prev, `Replaced in ${changed} file(s)\n`])
                  await refreshWorkspace()
                  const results = await window.api.findInFiles(fileTree.path, searchQuery)
                  setSearchResults(results)
                })
            }}
            onOpenContextMenu={openContextMenu}
            onSelectNode={(node, parentPath) => setSelectedNode({ node, parentPath })}
            onFileClick={handleFileClick}
          />
        </div>
        <div
          onMouseDown={startLeftPaneResize}
          style={{
            width: '6px',
            cursor: 'col-resize',
            background: 'var(--color-border)',
            flexShrink: 0
          }}
        />

        <div
          ref={centerPaneRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            backgroundColor: 'var(--color-bg)'
          }}
        >
          <div
            style={{
              display: 'flex',
              padding: '4px 8px 4px 4px',
              background: 'var(--color-toolbar)',
              borderBottom: '1px solid var(--color-border)',
              justifyContent: 'flex-end',
              gap: '8px'
            }}
          >
            {actionButtons.map((button) => (
              <button
                key={button.apiCall}
                title={button.title}
                aria-label={button.title}
                onClick={actionButtonHandlers[button.apiCall]}
                style={{
                  width: '24px',
                  height: '24px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  cursor: 'pointer'
                }}
              >
                <i className={`fa ${button.icon}`} />
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--color-surface-2)',
              overflowX: 'auto'
            }}
          >
            {tabs.map((tab) => (
              <div
                key={tab.path}
                onClick={() => setActiveTabPath(tab.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  backgroundColor:
                    resolvedActiveTabPath === tab.path
                      ? 'var(--color-bg)'
                      : 'var(--color-tab-inactive)',
                  borderTop:
                    resolvedActiveTabPath === tab.path
                      ? '1px solid #007acc'
                      : '1px solid transparent',
                  borderRight: '1px solid var(--color-bg)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color:
                    resolvedActiveTabPath === tab.path
                      ? 'var(--color-text)'
                      : 'var(--color-text-muted)'
                }}
              >
                {tab.content !== tab.savedContent && (
                  <i className="fa fa-circle" style={{ fontSize: '7px', color: '#d7ba7d' }} />
                )}
                {tab.name}
                <div
                  onClick={(e) => handleCloseTab(e, tab.path)}
                  style={{
                    borderRadius: '4px',
                    width: '18px',
                    height: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#444')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  ✕
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {activeTab ? (
              <Editor
                height="100%"
                path={monaco.Uri.file(activeTab.path).toString()}
                language={getLanguage(activeTab.name)}
                theme="vs-dark"
                value={activeTab.content}
                onChange={handleEditorChange}
                onMount={(editorInstance: MonacoEditor.IStandaloneCodeEditor) => {
                  monacoEditorRef.current = editorInstance
                  const position = editorInstance.getPosition()
                  if (position) {
                    setCursorLine(position.lineNumber)
                    setCursorColumn(position.column)
                  }
                  editorInstance.onDidChangeCursorPosition((event) => {
                    setCursorLine(event.position.lineNumber)
                    setCursorColumn(event.position.column)
                  })
                }}
                options={{ minimap: { enabled: false }, fontSize: 14 }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#555',
                  fontSize: '24px'
                }}
              >
                Open a file to start editing
              </div>
            )}
          </div>

          <div
            onMouseDown={startTerminalResize}
            style={{
              height: '6px',
              cursor: 'row-resize',
              background: 'var(--color-border)',
              flexShrink: 0
            }}
          />

          <TerminalPanel
            termTabs={termTabs}
            activeTermId={activeTermId}
            fileTreePath={fileTree?.path}
            height={terminalHeight}
            onSelectTab={setActiveTermId}
            onCloseTab={closeTerminal}
            onCreateTerminal={(cwd) => void createTerminal(cwd)}
          />
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasContextNode={hasContextNode}
          hasClipboard={Boolean(clipboard)}
          onAction={(action) => void runContextAction(action)}
        />
      )}

      <NameDialog
        isOpen={nameDialog.isOpen}
        title={nameDialog.title}
        value={nameDialog.value}
        placeholder={nameDialog.placeholder}
        onValueChange={(value) => setNameDialog((prev) => ({ ...prev, value }))}
        onCancel={() => setNameDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => void submitNameDialog()}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        defaultAction={confirmDialog.defaultAction}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false, onConfirm: null }))}
        onConfirm={() => {
          const confirmAction = confirmDialog.onConfirm
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, onConfirm: null }))
          if (confirmAction) void confirmAction()
        }}
      />

      <ErrorToast message={errorMessage} onClose={() => setErrorMessage(null)} />
      <FooterBar
        workspaceName={fileTree?.name || 'No workspace open'}
        line={cursorLine}
        column={cursorColumn}
        language={activeTab ? getLanguage(activeTab.name) : 'plaintext'}
        encoding="UTF-8"
      />
    </div>
  )
}

export default App
