/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useRef, useEffect, useState, type MouseEvent } from 'react'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
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
import { TitleBar } from './components/TitleBar'
import { EditorTabs } from './components/EditorTabs'
import { EditorPane } from './components/EditorPane'
import { LanguageClientsManager } from './lsp/client'
import { getBuiltInLspClientConfigs, registerBuiltInLanguages } from './lsp/registry'
import { getLanguage, resolveActiveTabPath } from './utils/editor'
import { useTerminalManager } from './hooks/useTerminalManager'
import { useWorkspaceActions } from './hooks/useWorkspaceActions'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useEditorTabs } from './hooks/useEditorTabs'
import { useWindowChrome } from './hooks/useWindowChrome'
import type { Tab } from './types'

loader.config({ monaco })
registerBuiltInLanguages()

function App() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [leftPaneTab, setLeftPaneTab] = useState<'workspace' | 'search'>('workspace')
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorColumn, setCursorColumn] = useState(1)
  const [leftPaneWidth, setLeftPaneWidth] = useState(280)
  const [terminalHeight, setTerminalHeight] = useState(260)

  const centerPaneRef = useRef<HTMLDivElement | null>(null)
  const lspManagerRef = useRef<LanguageClientsManager | null>(null)
  const monacoEditorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)

  const {
    fileTree,
    selectedNode,
    setSelectedNode,
    clipboard,
    nameDialog,
    setNameDialog,
    confirmDialog,
    setConfirmDialog,
    contextMenu,
    setContextMenu,
    searchResults,
    setSearchResults,
    refreshWorkspace,
    handleOpenWorkspace,
    handleCloseWorkspace,
    handleFileClick,
    handleCreateFile,
    handleCreateFolder,
    submitNameDialog,
    openContextMenu,
    runContextAction,
    runWorkspaceAction
  } = useWorkspaceActions({
    tabs,
    activeTabPath,
    setTabs,
    setActiveTabPath,
    setErrorMessage
  })

  const {
    termTabs,
    activeTermId,
    setActiveTermId,
    createTerminal,
    closeTerminal,
    appendOutputLine
  } = useTerminalManager({
    workspacePath: fileTree?.path,
    terminalHeight
  })

  const {
    isWindowMaximized,
    isTopMenuExpanded,
    setIsTopMenuExpanded,
    handleTopMenu,
    handleMinimize,
    handleToggleMaximize,
    handleClose
  } = useWindowChrome({
    onOpenWorkspace: handleOpenWorkspace,
    onCloseWorkspace: handleCloseWorkspace,
    onOpenSearch: () => setLeftPaneTab('search')
  })

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
  }, [setConfirmDialog, setContextMenu, setNameDialog])

  const { handleSaveCurrent, handleSaveAll, handleCloseTab, handleEditorChange } = useEditorTabs({
    tabs,
    activeTabPath,
    setTabs,
    setActiveTabPath,
    setConfirmDialog,
    setErrorMessage,
    monacoEditorRef
  })

  useAppShortcuts({
    monacoEditorRef,
    handleSaveCurrent,
    handleSaveAll,
    runWorkspaceAction: async (action) => {
      if (leftPaneTab !== 'workspace') return false
      return runWorkspaceAction(action)
    },
    leftPaneTab,
    nameDialogOpen: nameDialog.isOpen,
    confirmDialogOpen: confirmDialog.isOpen,
    appendOutputLine
  })

  const handleBuild = () => {
    window.api.triggerBuild()
    setActiveTermId('output')
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

  const resolvedActiveTabPath = resolveActiveTabPath(tabs, activeTabPath)
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
      <TitleBar
        appIcon={appIcon}
        isTopMenuExpanded={isTopMenuExpanded}
        isWindowMaximized={isWindowMaximized}
        onToggleMenu={() => setIsTopMenuExpanded((prev) => !prev)}
        onOpenMenu={handleTopMenu}
        onMinimize={handleMinimize}
        onToggleMaximize={() => void handleToggleMaximize()}
        onClose={handleClose}
      />

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
                  appendOutputLine(`Replaced in ${changed} file(s)`)
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

          <EditorTabs
            tabs={tabs}
            activeTabPath={resolvedActiveTabPath}
            onSelectTab={setActiveTabPath}
            onCloseTab={handleCloseTab}
          />

          <EditorPane
            activeTab={activeTab}
            monacoEditorRef={monacoEditorRef}
            onEditorChange={handleEditorChange}
            onCursorChange={(line, column) => {
              setCursorLine(line)
              setCursorColumn(column)
            }}
          />

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
