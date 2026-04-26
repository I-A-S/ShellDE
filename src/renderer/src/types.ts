export type Tab = {
  path: string
  name: string
  content: string
  savedContent: string
}

export type TermTab = {
  id: string
  title: string
  closable?: boolean
}

export type TreeNode = {
  name: string
  path: string
  isDirectory: boolean
  children?: TreeNode[]
}

export type SelectedNode = {
  node: TreeNode
  parentPath: string
}

export type NameDialogMode = 'create-file' | 'create-folder' | 'rename'

export type NameDialogState = {
  isOpen: boolean
  mode: NameDialogMode
  title: string
  value: string
  placeholder: string
}

export type ConfirmDialogState = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  defaultAction?: 'cancel' | 'confirm'
  onConfirm: null | (() => Promise<void>)
}

export type ContextMenuState = {
  x: number
  y: number
  node: TreeNode | null
  parentPath: string | null
}

export type SearchMatch = {
  line: number
  preview: string
}

export type SearchResult = {
  path: string
  count: number
  matches: SearchMatch[]
}
