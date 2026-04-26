import { ElectronAPI } from '@electron-toolkit/preload'

export type LspSpawnOptions = {
  id: string
  server: string
  workspaceRoot?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export type LspSpawnResult =
  | { ok: true; id: string; pid: number; command: string; args: string[] }
  | { ok: false; id: string; error: string }

export type LspExitInfo = { code: number | null; signal: string | null }

export type DirTreeNode = {
  name: string
  path: string
  isDirectory: boolean
  children?: DirTreeNode[]
}

export type LspAPI = {
  spawn: (options: LspSpawnOptions) => Promise<LspSpawnResult>
  write: (id: string, payloadBase64: string) => void
  stop: (id: string) => void
  onData: (id: string, callback: (payloadBase64: string) => void) => () => void
  onStderr: (id: string, callback: (text: string) => void) => () => void
  onExit: (id: string, callback: (info: LspExitInfo) => void) => () => void
}

type AppAPI = {
  triggerBuild: () => void
  onTerminalOutput: (callback: (data: string) => void) => void
  openFolder: () => Promise<DirTreeNode | null>
  getLastWorkspace: () => Promise<string | null>
  setLastWorkspace: (workspacePath: string | null) => Promise<boolean>
  readDirTree: (dirPath: string) => Promise<DirTreeNode>
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<boolean>
  createFile: (dirPath: string, name: string) => Promise<boolean>
  createFolder: (dirPath: string, name: string) => Promise<boolean>
  renamePath: (targetPath: string, newName: string) => Promise<boolean>
  deletePath: (targetPath: string) => Promise<boolean>
  pastePath: (sourcePath: string, destinationDir: string, cut: boolean) => Promise<boolean>
  findInFiles: (
    rootDir: string,
    query: string
  ) => Promise<
    Array<{ path: string; count: number; matches: Array<{ line: number; preview: string }> }>
  >
  replaceInFiles: (rootDir: string, query: string, replacement: string) => Promise<number>
  spawnTerminal: (id: string, cwd?: string) => Promise<string>
  writeTerminal: (id: string, data: string) => void
  resizeTerminal: (id: string, cols: number, rows: number) => void
  killTerminal: (id: string) => void
  onTerminalData: (id: string, callback: (data: string) => void) => void
  minimizeWindow: () => void
  toggleMaximizeWindow: () => void
  closeWindow: () => void
  isWindowMaximized: () => Promise<boolean>
  showAppMenu: (
    menuId: 'file' | 'edit' | 'selection' | 'view' | 'help',
    x?: number,
    y?: number
  ) => Promise<void>
  onMenuOpenWorkspace: (callback: () => void) => void
  onMenuCloseWorkspace: (callback: () => void) => void
  onMenuSaveCurrent: (callback: () => void) => void
  onMenuSaveAll: (callback: () => void) => void
  onMenuOpenSearch: (callback: (replaceMode: boolean) => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
    lsp: LspAPI
  }
}
