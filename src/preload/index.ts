import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  triggerBuild: () => ipcRenderer.send('trigger-build'),
  onTerminalOutput: (callback: (data: string) => void) => {
    ipcRenderer.removeAllListeners('terminal-output')
    ipcRenderer.on('terminal-output', (_event, value) => callback(value))
  },
  openFolder: () => ipcRenderer.invoke('open-folder'),
  getLastWorkspace: () => ipcRenderer.invoke('get-last-workspace'),
  setLastWorkspace: (workspacePath: string | null) =>
    ipcRenderer.invoke('set-last-workspace', workspacePath),
  readDirTree: (dirPath: string) => ipcRenderer.invoke('read-dir-tree', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('write-file', filePath, content),
  createFile: (dirPath: string, name: string) => ipcRenderer.invoke('create-file', dirPath, name),
  createFolder: (dirPath: string, name: string) =>
    ipcRenderer.invoke('create-folder', dirPath, name),
  renamePath: (targetPath: string, newName: string) =>
    ipcRenderer.invoke('rename-path', targetPath, newName),
  deletePath: (targetPath: string) => ipcRenderer.invoke('delete-path', targetPath),
  pastePath: (sourcePath: string, destinationDir: string, cut: boolean) =>
    ipcRenderer.invoke('paste-path', sourcePath, destinationDir, cut),
  findInFiles: (rootDir: string, query: string) =>
    ipcRenderer.invoke('find-in-files', rootDir, query),
  replaceInFiles: (rootDir: string, query: string, replacement: string) =>
    ipcRenderer.invoke('replace-in-files', rootDir, query, replacement),

  spawnTerminal: (id: string, cwd?: string) => ipcRenderer.invoke('terminal-spawn', id, cwd),
  writeTerminal: (id: string, data: string) => ipcRenderer.send('terminal-write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal-resize', id, cols, rows),
  killTerminal: (id: string) => ipcRenderer.send('terminal-kill', id),
  onTerminalData: (id: string, callback: (data: string) => void) => {
    // Remove old listeners to prevent memory leaks if tabs are closed/reopened
    ipcRenderer.removeAllListeners(`terminal-data-${id}`)
    ipcRenderer.on(`terminal-data-${id}`, (_event, data) => callback(data))
  },
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window-maximize-toggle'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  showAppMenu: (menuId: 'file' | 'edit' | 'selection' | 'view' | 'help', x?: number, y?: number) =>
    ipcRenderer.invoke('show-app-menu', menuId, x, y),
  onMenuOpenWorkspace: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-open-workspace')
    ipcRenderer.on('menu-open-workspace', () => callback())
  },
  onMenuCloseWorkspace: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-close-workspace')
    ipcRenderer.on('menu-close-workspace', () => callback())
  },
  onMenuSaveCurrent: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-save-current')
    ipcRenderer.on('menu-save-current', () => callback())
  },
  onMenuSaveAll: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-save-all')
    ipcRenderer.on('menu-save-all', () => callback())
  },
  onMenuOpenSearch: (callback: (replaceMode: boolean) => void) => {
    ipcRenderer.removeAllListeners('menu-open-search')
    ipcRenderer.removeAllListeners('menu-open-search-replace')
    ipcRenderer.on('menu-open-search', () => callback(false))
    ipcRenderer.on('menu-open-search-replace', () => callback(true))
  }
}

type LspSpawnOptions = {
  id: string
  server: string
  workspaceRoot?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}

type LspSpawnResult =
  | { ok: true; id: string; pid: number; command: string; args: string[] }
  | { ok: false; id: string; error: string }

const lsp = {
  spawn: (options: LspSpawnOptions): Promise<LspSpawnResult> =>
    ipcRenderer.invoke('lsp-spawn', options),
  write: (id: string, payloadBase64: string): void =>
    ipcRenderer.send('lsp-write', id, payloadBase64),
  stop: (id: string): void => ipcRenderer.send('lsp-stop', id),
  onData: (id: string, callback: (payloadBase64: string) => void): (() => void) => {
    const channel = `lsp-data-${id}`
    const listener = (_event: unknown, payload: string): void => callback(payload)
    ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1])
    return () => ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.removeListener>[1])
  },
  onStderr: (id: string, callback: (text: string) => void): (() => void) => {
    const channel = `lsp-stderr-${id}`
    const listener = (_event: unknown, payload: string): void => callback(payload)
    ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1])
    return () => ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.removeListener>[1])
  },
  onExit: (
    id: string,
    callback: (info: { code: number | null; signal: string | null }) => void
  ): (() => void) => {
    const channel = `lsp-exit-${id}`
    const listener = (
      _event: unknown,
      payload: { code: number | null; signal: string | null }
    ): void => callback(payload)
    ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1])
    return () => ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.removeListener>[1])
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('lsp', lsp)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.lsp = lsp
}
