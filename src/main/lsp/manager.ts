import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app, type WebContents } from 'electron'

export type LspServerId = string

export type SpawnOptions = {
  id: string
  server: LspServerId
  workspaceRoot?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export type SpawnResult =
  | { ok: true; id: string; pid: number; command: string; args: string[] }
  | { ok: false; id: string; error: string }

type Session = {
  id: string
  child: ChildProcessWithoutNullStreams
  webContents: WebContents
}

const sessions = new Map<string, Session>()

const isPackaged = (): boolean => app.isPackaged

const resolveFromAsarUnpacked = (relativePath: string): string => {
  // In a packaged app, dependencies in asarUnpack live under app.asar.unpacked.
  // require.resolve still returns the asar path; rewrite it to the unpacked copy
  // so spawn() can read the script file from disk.
  if (!isPackaged()) return relativePath
  const marker = `${path.sep}app.asar${path.sep}`
  if (relativePath.includes(marker)) {
    return relativePath.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`)
  }
  return relativePath
}

const resolvePyrightLauncher = (): string => {
  const pkgPath = require.resolve('pyright/package.json')
  const dir = path.dirname(pkgPath)
  const launcher = path.join(dir, 'langserver.index.js')
  return resolveFromAsarUnpacked(launcher)
}

const findRuffOnPath = (): string | null => {
  const pathEnv = process.env.PATH || ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : ['']
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = path.join(dir, `ruff${ext.toLowerCase()}`)
      if (fs.existsSync(candidate)) return candidate
      const candidateUpper = path.join(dir, `ruff${ext}`)
      if (fs.existsSync(candidateUpper)) return candidateUpper
    }
  }
  return null
}

const resolveBundledRuff = (): string | null => {
  // Look for a platform-specific ruff binary placed in resources/ruff during packaging.
  const binName = process.platform === 'win32' ? 'ruff.exe' : 'ruff'
  const candidates = isPackaged()
    ? [path.join(process.resourcesPath, 'ruff', binName)]
    : [
        path.join(app.getAppPath(), 'resources', 'ruff', binName),
        path.join(__dirname, '..', '..', 'resources', 'ruff', binName)
      ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

type SpawnCommand = { command: string; args: string[]; env: NodeJS.ProcessEnv }
type SpawnResolver = (options: SpawnOptions) => SpawnCommand

const pyrightResolver: SpawnResolver = (options) => {
  const launcher = resolvePyrightLauncher()
  return {
    command: process.execPath,
    args: [launcher, '--stdio'],
    env: {
      ...process.env,
      ...(options.env ?? {}),
      ELECTRON_RUN_AS_NODE: '1'
    }
  }
}

const ruffResolver: SpawnResolver = (options) => {
  const ruffBinary = resolveBundledRuff() ?? findRuffOnPath()
  if (!ruffBinary) {
    throw new Error('ruff binary not found (looked in resources/ruff and PATH)')
  }
  return {
    command: ruffBinary,
    args: ['server'],
    env: { ...process.env, ...(options.env ?? {}) }
  }
}

const serverResolvers: Record<string, SpawnResolver> = {
  pyright: pyrightResolver,
  ruff: ruffResolver
}

const buildSpawnArgs = (options: SpawnOptions): SpawnCommand => {
  if (options.command) {
    return {
      command: options.command,
      args: options.args ?? [],
      env: { ...process.env, ...(options.env ?? {}) }
    }
  }

  const resolver = serverResolvers[options.server]
  if (!resolver) {
    throw new Error(
      `No resolver registered for LSP server '${options.server}'. Provide 'command' for custom servers.`
    )
  }
  return resolver(options)
}

export const spawnLspServer = (
  webContents: WebContents,
  options: SpawnOptions
): SpawnResult => {
  if (sessions.has(options.id)) {
    return { ok: false, id: options.id, error: `LSP session ${options.id} already exists` }
  }

  let resolved: { command: string; args: string[]; env: NodeJS.ProcessEnv }
  try {
    resolved = buildSpawnArgs(options)
    console.info(
      `[lsp:spawn] id=${options.id} server=${options.server} command=${resolved.command} args=${resolved.args.join(' ')}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, id: options.id, error: message }
  }

  const cwd =
    options.workspaceRoot && fs.existsSync(options.workspaceRoot)
      ? options.workspaceRoot
      : process.cwd()

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(resolved.command, resolved.args, {
      cwd,
      env: resolved.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, id: options.id, error: `Failed to spawn LSP server: ${message}` }
  }

  const session: Session = { id: options.id, child, webContents }
  sessions.set(options.id, session)

  const dataChannel = `lsp-data-${options.id}`
  const stderrChannel = `lsp-stderr-${options.id}`
  const exitChannel = `lsp-exit-${options.id}`

  const safeSend = (channel: string, payload: unknown): void => {
    if (webContents.isDestroyed()) return
    try {
      webContents.send(channel, payload)
    } catch {
      // Renderer may be tearing down; ignore.
    }
  }

  child.stdout.on('data', (chunk: Buffer) => {
    // Forward as a base64 string so JSON-RPC framing bytes survive IPC intact.
    safeSend(dataChannel, chunk.toString('base64'))
  })

  child.stderr.on('data', (chunk: Buffer) => {
    safeSend(stderrChannel, chunk.toString('utf-8'))
  })

  const cleanup = (code: number | null, signal: NodeJS.Signals | null): void => {
    sessions.delete(options.id)
    safeSend(exitChannel, { code, signal })
  }

  child.on('exit', cleanup)
  child.on('error', (error) => {
    safeSend(stderrChannel, `[spawn-error] ${error.message}\n`)
  })

  return {
    ok: true,
    id: options.id,
    pid: child.pid ?? -1,
    command: resolved.command,
    args: resolved.args
  }
}

export const writeToLspServer = (id: string, payloadBase64: string): void => {
  const session = sessions.get(id)
  if (!session) return
  const buffer = Buffer.from(payloadBase64, 'base64')
  session.child.stdin.write(buffer)
}

export const stopLspServer = (id: string): void => {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)
  try {
    session.child.kill()
  } catch {
    // already exited
  }
}

export const stopAllLspServers = (): void => {
  for (const session of sessions.values()) {
    try {
      session.child.kill()
    } catch {
      // ignore
    }
  }
  sessions.clear()
}

export const removeLspSessionsForWebContents = (webContents: WebContents): void => {
  for (const [id, session] of sessions) {
    if (session.webContents !== webContents) continue
    try {
      session.child.kill()
    } catch {
      // ignore
    }
    sessions.delete(id)
  }
}
