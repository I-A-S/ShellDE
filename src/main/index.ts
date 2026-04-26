import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import fs from 'fs'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as os from 'os'
import * as pty from 'node-pty'
import icon from '../../resources/icon.svg?asset'
import iconIco from '../../resources/icon.ico?asset'
import {
  spawnLspServer,
  writeToLspServer,
  stopLspServer,
  stopAllLspServers,
  removeLspSessionsForWebContents,
  type SpawnOptions
} from './lsp/manager'

const getShell = () => {
  if (os.platform() === 'win32') return 'powershell.exe'
  return process.env.SHELL || 'bash' // Captures bash or zsh automatically on Linux/Mac
}

const ptySessions: Record<string, pty.IPty> = {}
const preferencesPath = path.join(app.getPath('userData'), 'preferences.json')

const getUniquePath = (targetPath: string): string => {
  if (!fs.existsSync(targetPath)) return targetPath

  const ext = path.extname(targetPath)
  const base = path.basename(targetPath, ext)
  const dir = path.dirname(targetPath)
  let index = 1

  while (true) {
    const candidate = path.join(dir, `${base}-copy-${index}${ext}`)
    if (!fs.existsSync(candidate)) return candidate
    index += 1
  }
}

const shouldSkipName = (name: string): boolean => name.startsWith('.')

const walkFiles = (dirPath: string): string[] => {
  const results: string[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldSkipName(entry.name)) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath))
      continue
    }
    results.push(fullPath)
  }
  return results
}

const readPreferences = (): { lastWorkspacePath?: string } => {
  try {
    if (!fs.existsSync(preferencesPath)) return {}
    return JSON.parse(fs.readFileSync(preferencesPath, 'utf-8'))
  } catch {
    return {}
  }
}

const writePreferences = (preferences: { lastWorkspacePath?: string }): void => {
  fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2), 'utf-8')
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    icon: process.platform === 'win32' ? iconIco : icon,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('destroyed', () => {
    removeLspSessionsForWebContents(mainWindow.webContents)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.iasoft.shellde')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  function getDirTree(dirPath: string) {
    const result = {
      name: path.basename(dirPath),
      path: dirPath,
      isDirectory: true,
      children: [] as any[]
    }

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const item of items) {
        // Skip hidden files/folders like .git
        if (item.name.startsWith('.')) continue

        const fullPath = path.join(dirPath, item.name)
        if (item.isDirectory()) {
          result.children.push(getDirTree(fullPath))
        } else {
          result.children.push({ name: item.name, path: fullPath, isDirectory: false })
        }
      }
      // Sort: folders first, then files
      result.children.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name)
        return a.isDirectory ? -1 : 1
      })
    } catch (e) {
      console.error('Failed to read directory', e)
    }
    return result
  }

  // 2. Handle 'Open Workspace' request
  ipcMain.handle('open-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (canceled || filePaths.length === 0) return null
    return getDirTree(filePaths[0])
  })

  ipcMain.handle('get-last-workspace', () => {
    const pathFromPreferences = readPreferences().lastWorkspacePath
    if (!pathFromPreferences || !fs.existsSync(pathFromPreferences)) return null
    return pathFromPreferences
  })

  ipcMain.handle('set-last-workspace', (_event, workspacePath: string | null) => {
    if (!workspacePath) {
      const preferences = readPreferences()
      delete preferences.lastWorkspacePath
      writePreferences(preferences)
      return true
    }
    if (!fs.existsSync(workspacePath)) return false
    writePreferences({ ...readPreferences(), lastWorkspacePath: workspacePath })
    return true
  })

  // 3. Handle 'Read File' request
  ipcMain.handle('read-file', (_event, filePath) => {
    return fs.readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('write-file', (_event, filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('read-dir-tree', (_event, dirPath: string) => {
    return getDirTree(dirPath)
  })

  ipcMain.handle('create-file', (_event, dirPath: string, name: string) => {
    const target = path.join(dirPath, name)
    if (fs.existsSync(target)) throw new Error('File already exists')
    fs.writeFileSync(target, '', 'utf-8')
    return true
  })

  ipcMain.handle('create-folder', (_event, dirPath: string, name: string) => {
    const target = path.join(dirPath, name)
    if (fs.existsSync(target)) throw new Error('Folder already exists')
    fs.mkdirSync(target)
    return true
  })

  ipcMain.handle('rename-path', (_event, targetPath: string, newName: string) => {
    const nextPath = path.join(path.dirname(targetPath), newName)
    if (fs.existsSync(nextPath)) throw new Error('Target name already exists')
    fs.renameSync(targetPath, nextPath)
    return true
  })

  ipcMain.handle('delete-path', (_event, targetPath: string) => {
    if (!fs.existsSync(targetPath)) return true
    fs.rmSync(targetPath, { recursive: true, force: true })
    return true
  })

  ipcMain.handle(
    'paste-path',
    (_event, sourcePath: string, destinationDir: string, cut: boolean) => {
      const targetPath = getUniquePath(path.join(destinationDir, path.basename(sourcePath)))

      if (cut) {
        try {
          fs.renameSync(sourcePath, targetPath)
          return true
        } catch {
          // Cross-device rename can fail; fallback to copy+delete.
        }
      }

      const stat = fs.statSync(sourcePath)
      if (stat.isDirectory()) {
        fs.cpSync(sourcePath, targetPath, { recursive: true })
        if (cut) fs.rmSync(sourcePath, { recursive: true, force: true })
        return true
      }

      fs.copyFileSync(sourcePath, targetPath)
      if (cut) fs.rmSync(sourcePath, { force: true })
      return true
    }
  )

  ipcMain.handle('find-in-files', (_event, rootDir: string, query: string) => {
    if (!query.trim()) return []
    const files = walkFiles(rootDir)
    const results: Array<{
      path: string
      count: number
      matches: Array<{ line: number; preview: string }>
    }> = []
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parts = content.split(query)
        const count = parts.length - 1
        if (count > 0) {
          const lines = content.split(/\r?\n/)
          const matches: Array<{ line: number; preview: string }> = []
          for (let index = 0; index < lines.length; index += 1) {
            if (lines[index].includes(query)) {
              matches.push({ line: index + 1, preview: lines[index].trim() })
              if (matches.length >= 5) break
            }
          }
          results.push({ path: filePath, count, matches })
        }
      } catch {
        // Ignore non-text files.
      }
    }
    return results
  })

  ipcMain.handle(
    'replace-in-files',
    (_event, rootDir: string, query: string, replacement: string) => {
      if (!query.trim()) return 0
      const files = walkFiles(rootDir)
      let filesChanged = 0
      for (const filePath of files) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          if (!content.includes(query)) continue
          const nextContent = content.split(query).join(replacement)
          fs.writeFileSync(filePath, nextContent, 'utf-8')
          filesChanged += 1
        } catch {
          // Ignore non-text files.
        }
      }
      return filesChanged
    }
  )

  ipcMain.on('trigger-build', (event) => {
    event.sender.send('terminal-output', '\r\n\x1b[33m> Starting Build...\x1b[0m\r\n')

    let count = 0
    const interval = setInterval(() => {
      event.sender.send('terminal-output', `[INFO] Compiling module source_${count}...\r\n`)
      count++

      if (count > 4) {
        clearInterval(interval)
        event.sender.send('terminal-output', '\x1b[32m> Build completed successfully.\x1b[0m\r\n')
      }
    }, 600)
  })

  ipcMain.handle('terminal-spawn', (event, id: string, cwd?: string) => {
    const shell = getShell()
    const safeCwd =
      cwd && fs.existsSync(cwd) ? cwd : process.env.HOME || process.env.USERPROFILE || process.cwd()

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: safeCwd,
      env: process.env
    })

    ptySessions[id] = ptyProcess

    // Pipe shell output to the frontend
    ptyProcess.onData((data) => {
      event.sender.send(`terminal-data-${id}`, data)
    })

    return shell // Let UI know what shell booted
  })

  // Receive keystrokes from UI and push to the shell
  ipcMain.on('terminal-write', (_event, id: string, data: string) => {
    if (ptySessions[id]) ptySessions[id].write(data)
  })

  // Handle terminal resizing
  ipcMain.on('terminal-resize', (_event, id: string, cols: number, rows: number) => {
    if (ptySessions[id]) ptySessions[id].resize(cols, rows)
  })

  ipcMain.on('terminal-kill', (_event, id: string) => {
    if (ptySessions[id]) {
      ptySessions[id].kill()
      delete ptySessions[id]
    }
  })

  ipcMain.handle('lsp-spawn', (event, options: SpawnOptions) => {
    return spawnLspServer(event.sender, options)
  })

  ipcMain.on('lsp-write', (_event, id: string, payloadBase64: string) => {
    writeToLspServer(id, payloadBase64)
  })

  ipcMain.on('lsp-stop', (_event, id: string) => {
    stopLspServer(id)
  })

  ipcMain.on('window-minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })

  ipcMain.on('window-maximize-toggle', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) {
      window.unmaximize()
      return
    }
    window.maximize()
  })

  ipcMain.on('window-close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })

  ipcMain.handle('window-is-maximized', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window?.isMaximized() ?? false
  })

  ipcMain.handle(
    'show-app-menu',
    async (
      event,
      menuId: 'file' | 'edit' | 'selection' | 'view' | 'help',
      anchorX?: number,
      anchorY?: number
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return

      const templates = {
        file: {
          label: 'File',
          submenu: [
            {
              label: 'Open Workspace',
              click: () => window.webContents.send('menu-open-workspace')
            },
            {
              label: 'Close Workspace',
              click: () => window.webContents.send('menu-close-workspace')
            },
            { type: 'separator' as const },
            {
              label: 'Save',
              accelerator: 'CommandOrControl+S',
              click: () => window.webContents.send('menu-save-current')
            },
            {
              label: 'Save All',
              accelerator: 'CommandOrControl+Shift+S',
              click: () => window.webContents.send('menu-save-all')
            },
            { type: 'separator' as const },
            { role: 'close' as const },
            { role: 'quit' as const }
          ]
        },
        edit: {
          label: 'Edit',
          submenu: [
            { role: 'undo' as const },
            { role: 'redo' as const },
            { type: 'separator' as const },
            { role: 'cut' as const },
            { role: 'copy' as const },
            { role: 'paste' as const },
            { role: 'delete' as const },
            { role: 'selectAll' as const },
            { type: 'separator' as const },
            {
              label: 'Find in Files',
              accelerator: 'CommandOrControl+Shift+F',
              click: () => window.webContents.send('menu-open-search')
            },
            {
              label: 'Replace in Files',
              accelerator: 'CommandOrControl+Shift+H',
              click: () => window.webContents.send('menu-open-search-replace')
            }
          ]
        },
        selection: {
          label: 'Selection',
          submenu: [{ role: 'selectAll' as const }]
        },
        view: {
          label: 'View',
          submenu: [
            { role: 'reload' as const },
            { role: 'forceReload' as const },
            { role: 'toggleDevTools' as const },
            { type: 'separator' as const },
            { role: 'togglefullscreen' as const }
          ]
        },
        help: {
          label: 'Help',
          submenu: [
            {
              label: 'About',
              click: async () => {
                await dialog.showMessageBox(window, {
                  type: 'info',
                  title: 'About',
                  message: 'IA IDE Shell',
                  detail: 'shellde'
                })
              }
            }
          ]
        }
      }

      const menu = Menu.buildFromTemplate(templates[menuId].submenu)

      menu.popup({
        window,
        x: typeof anchorX === 'number' ? anchorX : undefined,
        y: typeof anchorY === 'number' ? anchorY : undefined
      })
    }
  )

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopAllLspServers()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
