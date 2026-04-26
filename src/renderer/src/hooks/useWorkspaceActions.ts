/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import type {
  ConfirmDialogState,
  ContextMenuState,
  NameDialogState,
  SearchResult,
  SelectedNode,
  Tab,
  TreeNode
} from '../types'

type NameDialogMode = 'create-file' | 'create-folder' | 'rename'

type UseWorkspaceActionsParams = {
  tabs: Tab[]
  activeTabPath: string | null
  setTabs: Dispatch<SetStateAction<Tab[]>>
  setActiveTabPath: Dispatch<SetStateAction<string | null>>
  setErrorMessage: Dispatch<SetStateAction<string | null>>
}

type UseWorkspaceActionsResult = {
  fileTree: TreeNode | null
  setFileTree: Dispatch<SetStateAction<TreeNode | null>>
  selectedNode: SelectedNode | null
  setSelectedNode: Dispatch<SetStateAction<SelectedNode | null>>
  clipboard: { sourcePath: string; cut: boolean } | null
  nameDialog: NameDialogState
  setNameDialog: Dispatch<SetStateAction<NameDialogState>>
  confirmDialog: ConfirmDialogState
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>
  contextMenu: ContextMenuState | null
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  searchResults: SearchResult[]
  setSearchResults: Dispatch<SetStateAction<SearchResult[]>>
  refreshWorkspace: () => Promise<void>
  handleOpenWorkspace: () => Promise<void>
  handleCloseWorkspace: () => Promise<void>
  handleFileClick: (filePath: string, fileName: string) => Promise<void>
  handleCreateFile: () => void
  handleCreateFolder: () => void
  submitNameDialog: () => Promise<void>
  openContextMenu: (
    event: MouseEvent<HTMLDivElement>,
    node: TreeNode | null,
    parentPath: string | null
  ) => void
  runContextAction: (
    action: 'new-file' | 'new-folder' | 'rename' | 'delete' | 'copy' | 'cut' | 'paste' | 'refresh'
  ) => Promise<void>
  runWorkspaceAction: (action: 'rename' | 'delete' | 'copy' | 'cut' | 'paste') => Promise<boolean>
}

export function useWorkspaceActions({
  tabs,
  activeTabPath,
  setTabs,
  setActiveTabPath,
  setErrorMessage
}: UseWorkspaceActionsParams): UseWorkspaceActionsResult {
  const [fileTree, setFileTree] = useState<TreeNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [clipboard, setClipboard] = useState<{ sourcePath: string; cut: boolean } | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    window.api.getLastWorkspace().then(async (workspacePath) => {
      if (!workspacePath) return
      const tree = await window.api.readDirTree(workspacePath)
      setFileTree(tree)
      setSelectedNode(null)
    })
  }, [])

  const refreshWorkspace = async () => {
    if (!fileTree?.path) return
    const tree = await window.api.readDirTree(fileTree.path)
    setFileTree(tree)
  }

  const withFsAction = async (action: () => Promise<void>) => {
    try {
      await action()
      await refreshWorkspace()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'File operation failed')
    }
  }

  const handleOpenWorkspace = async () => {
    const tree = await window.api.openFolder()
    if (tree) {
      setFileTree(tree)
      setSelectedNode(null)
      await window.api.setLastWorkspace(tree.path)
    }
  }

  const handleCloseWorkspace = async () => {
    setFileTree(null)
    setSelectedNode(null)
    setSearchResults([])
    await window.api.setLastWorkspace(null)
  }

  const handleFileClick = async (filePath: string, fileName: string) => {
    if (tabs.find((tab) => tab.path === filePath)) {
      setActiveTabPath(filePath)
      return
    }
    const content = await window.api.readFile(filePath)
    setTabs((prev) => [...prev, { path: filePath, name: fileName, content, savedContent: content }])
    setActiveTabPath(filePath)
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

  const runWorkspaceAction = async (action: 'rename' | 'delete' | 'copy' | 'cut' | 'paste') => {
    if (!fileTree) return false

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

  return {
    fileTree,
    setFileTree,
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
  }
}
